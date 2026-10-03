let allQuestions = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let answered = false;
let currentTopic = "";
let currentMode = "topic"; // "topic", "exam", "wrong"
let questionStates = {};
let currentTopicStarted = false;

let topicStartTime = null;
let topicTimerInterval = null;
let elapsedSeconds = 0;

// Час початку КОНКРЕТНОГО питання
let questionStartTime = null;

let teacherRefCode = null;

const SUPABASE_URL = "https://tsqjfphauhphdksstbob.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hLnSso-oks7c2BNJyneiCA_oNIaGDLU";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

let currentUser = null;
let currentProfile = null;


/* =========================================================
   REFERRAL
========================================================= */

function getReferralCodeFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const ref = params.get("ref");
        return ref ? ref.trim() : null;
    } catch (error) {
        console.error("Не вдалося зчитати ref з URL:", error);
        return null;
    }
}

function saveReferralCode(refCode) {
    if (!refCode) return;
    localStorage.setItem("teacher_ref_code", refCode);
}

function loadSavedReferralCode() {
    return localStorage.getItem("teacher_ref_code");
}

function initReferralCode() {
    const refFromUrl = getReferralCodeFromUrl();

    if (refFromUrl) {
        teacherRefCode = refFromUrl;
        saveReferralCode(refFromUrl);
        return;
    }

    const savedRef = loadSavedReferralCode();

    if (savedRef) {
        teacherRefCode = savedRef;
    }
}


/* =========================================================
   QUESTIONS
========================================================= */

async function loadQuestions() {
    try {
        const response = await fetch("questions.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити questions.json");
        }

        allQuestions = await response.json();

    } catch (error) {
        console.error("Помилка завантаження питань:", error);

        const trainingSection = document.querySelector("#training");

        if (trainingSection) {
            trainingSection.innerHTML = `
                <h2>Іспит</h2>
                <div class="panel">
                    <p>
                        Не вдалося завантажити питання.
                        Перевір файл questions.json.
                    </p>
                </div>
            `;
        }
    }
}


/* =========================================================
   SUPABASE — LOAD STATISTICS
========================================================= */

async function loadUserStatsFromSupabase() {
    if (!currentUser) return [];

    const { data, error } = await supabaseClient
        .from("user_stats")
        .select(`
            topic,
            question_id,
            correct,
            created_at,
            time_spent_seconds
        `)
        .eq("user_id", currentUser.id)
        .order("created_at", {
            ascending: true
        });

    if (error) {
        console.error(
            "Не вдалося завантажити статистику з Supabase:",
            error
        );

        return [];
    }

    return (data || []).map((item) => ({
        topic: item.topic,
        questionId: item.question_id,
        correct: item.correct,
        timeSpentSeconds: Number(item.time_spent_seconds) || 0,
        time: item.created_at
    }));
}


/* =========================================================
   SUPABASE — SAVE STATISTIC
========================================================= */

async function addStat(
    topic,
    questionId,
    isCorrect,
    timeSpentSeconds
) {
    if (!currentUser) return;

    const cleanTime = Math.max(
        0,
        Math.round(Number(timeSpentSeconds) || 0)
    );

    console.log("ADD STAT:", {
        user_id: currentUser.id,
        topic,
        questionId,
        isCorrect,
        timeSpentSeconds: cleanTime
    });

    const { data, error } = await supabaseClient
        .from("user_stats")
        .upsert(
            [
                {
                    user_id: currentUser.id,
                    topic: topic,
                    question_id: String(questionId),
                    correct: isCorrect,
                    created_at: new Date().toISOString(),

                    // ВАЖЛИВО:
                    // тут тепер записується час ЛИШЕ ЦЬОГО питання
                    time_spent_seconds: cleanTime
                }
            ],
            {
                onConflict: "user_id,question_id"
            }
        );

    console.log("UPSERT RESULT:", {
        data,
        error
    });

    if (error) {
        console.error(
            "Не вдалося зберегти статистику в Supabase:",
            error
        );
    }
}


/* =========================================================
   TIME FORMAT
========================================================= */

function formatTime(totalSeconds) {
    totalSeconds = Math.max(
        0,
        Math.round(Number(totalSeconds) || 0)
    );

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) {
        return `${seconds} с`;
    }

    return `${minutes} хв ${seconds} с`;
}


/* =========================================================
   TOPIC TIMER
========================================================= */

function startTopicTimer() {
    stopTopicTimer();

    topicStartTime = Date.now();
    elapsedSeconds = 0;

    const timerEl = document.getElementById("topic-timer");

    if (timerEl) {
        timerEl.textContent = formatTime(elapsedSeconds);
    }

    topicTimerInterval = setInterval(() => {
        elapsedSeconds++;

        const timer = document.getElementById("topic-timer");

        if (timer) {
            timer.textContent = formatTime(elapsedSeconds);
        }
    }, 1000);
}

function stopTopicTimer() {
    if (topicTimerInterval) {
        clearInterval(topicTimerInterval);
        topicTimerInterval = null;
    }
}


/* =========================================================
   QUESTION TIMER
========================================================= */

function startQuestionTimer() {
    questionStartTime = Date.now();
}

function getCurrentQuestionTime() {
    if (!questionStartTime) {
        return 0;
    }

    const diffMs = Date.now() - questionStartTime;

    return Math.max(
        1,
        Math.round(diffMs / 1000)
    );
}


/* =========================================================
   RANDOM QUESTIONS
========================================================= */

function getRandomQuestions(sourceQuestions, count) {
    const shuffled = [...sourceQuestions]
        .sort(() => Math.random() - 0.5);

    return shuffled.slice(
        0,
        Math.min(count, shuffled.length)
    );
}


/* =========================================================
   ACCESS
========================================================= */

function hasPaidAccess(profile) {
    if (!profile) return false;

    if (
        profile.role === "teacher" ||
        profile.role === "admin"
    ) {
        return true;
    }

    if (!profile.paid_until) return false;

    return new Date(profile.paid_until) > new Date();
}

function isTopicsLocked() {
    if (!currentProfile) return true;

    return !hasPaidAccess(currentProfile);
}

function showTopicsLockedMessage() {
    const lockedPanel =
        document.getElementById("topics-locked-panel");

    const topicsGrid =
        document.getElementById("topics-grid");

    const trainingSection =
        document.querySelector("#training");

    if (lockedPanel) {
        lockedPanel.style.display = "block";
    }

    if (topicsGrid) {
        topicsGrid.style.display = "none";
    }

    if (trainingSection) {
        trainingSection.innerHTML = `
            <h2>Доступ обмежено</h2>

            <div class="panel">
                <p>
                    Для доступу до тем потрібна
                    активна оплата на 6 тижнів.
                </p>

                

                <button
                    class="btn btn-primary"
                    onclick="location.href='index.html'"
                >
                    На головну
                </button>
            </div>
        `;
    }
}


/* =========================================================
   PAYMENT
========================================================= */

async function startPayment(event) {
    if (
        event &&
        typeof event.preventDefault === "function"
    ) {
        event.preventDefault();
    }

    if (
        event &&
        typeof event.stopPropagation === "function"
    ) {
        event.stopPropagation();
    }

    if (!currentUser) {
        alert(
            "Для оплати потрібно створити акаунт та увійти в нього.\n\n" +
            "Це потрібно для того, щоб після успішної оплати " +
            "система автоматично активувала доступ до тестів " +
            "у вашому профілі."
        );
        return;
    }

    try {
        const { data: sessionData } =
            await supabaseClient.auth.getSession();

        const accessToken =
            sessionData?.session?.access_token;

        if (!accessToken) {
            alert(
                "Не вдалося отримати токен користувача."
            );
            return;
        }

        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/start-payment-ts`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${accessToken}`
                },

                body: JSON.stringify({
                    userId: currentUser.id
                })
            }
        );

        const rawText = await response.text();

        console.log(
            "start-payment raw response:",
            rawText
        );

        let data;

        try {
            data = JSON.parse(rawText);

            if (typeof data === "string") {
                data = JSON.parse(data);
            }

        } catch (parseError) {
            console.error(
                "start-payment parse error:",
                parseError
            );

            alert(
                "Сервер повернув некоректну відповідь."
            );

            return;
        }

        if (!response.ok) {
            console.error(
                "start-payment error:",
                data
            );

            alert(
                data.message ||
                "Не вдалося підготувати оплату."
            );

            return;
        }

        if (
            !data ||
            data.status !== "ok" ||
            !data.data
        ) {
            alert(
                "Некоректна відповідь від сервера оплати."
            );

            return;
        }

        const p = data.data;

        const requiredFields = [
            "merchantAccount",
            "merchantAuthType",
            "merchantDomainName",
            "orderReference",
            "orderDate",
            "amount",
            "currency",
            "productName",
            "productPrice",
            "productCount",
            "merchantSignature",
            "clientFirstName",
            "clientLastName",
            "clientEmail",
            "language",
            "serviceUrl",
            "returnUrl"
        ];

        for (const field of requiredFields) {
            if (
                p[field] === undefined ||
                p[field] === null
            ) {
                console.error(
                    "Missing payment field:",
                    field,
                    p
                );

                alert(
                    `Сервер не повернув поле ${field}.`
                );

                return;
            }
        }

        const form = document.createElement("form");

        form.method = "POST";
        form.action =
            "https://secure.wayforpay.com/pay";

        form.acceptCharset = "utf-8";
        form.target = "_blank";
        form.style.display = "none";

        const fields = {
            merchantAccount:
                String(p.merchantAccount || ""),

            merchantAuthType:
                String(
                    p.merchantAuthType ||
                    "SimpleSignature"
                ),

            merchantDomainName:
                String(
                    p.merchantDomainName || ""
                ),

            orderReference:
                String(
                    p.orderReference || ""
                ),

            orderDate:
                String(
                    p.orderDate || ""
                ),

            amount:
                String(
                    p.amount || ""
                ),

            currency:
                String(
                    p.currency || ""
                ),

            productName:
                Array.isArray(p.productName)
                    ? String(
                        p.productName[0] || ""
                    )
                    : String(
                        p.productName || ""
                    ),

            productPrice:
                Array.isArray(p.productPrice)
                    ? String(
                        p.productPrice[0] || ""
                    )
                    : String(
                        p.productPrice || ""
                    ),

            productCount:
                Array.isArray(p.productCount)
                    ? String(
                        p.productCount[0] || ""
                    )
                    : String(
                        p.productCount || ""
                    ),

            merchantSignature:
                String(
                    p.merchantSignature || ""
                ),

            clientFirstName:
                String(
                    p.clientFirstName || ""
                ),

            clientLastName:
                String(
                    p.clientLastName || ""
                ),

            clientEmail:
                String(
                    p.clientEmail || ""
                ),

            language:
                String(
                    p.language || "UA"
                ),

            serviceUrl:
                String(
                    p.serviceUrl || ""
                ),

            returnUrl:
                String(
                    p.returnUrl || ""
                )
        };

        Object.entries(fields).forEach(
            ([key, value]) => {
                const input =
                    document.createElement("input");

                input.type = "hidden";
                input.name = key;
                input.value = value;

                form.appendChild(input);
            }
        );

        document.body.appendChild(form);

        form.submit();

    } catch (err) {
        console.error(
            "Payment error:",
            err
        );

        alert(
            "Помилка запуску оплати."
        );
    }
}


/* =========================================================
   OPEN TOPIC
========================================================= */

function openTopic(topic) {
    if (!currentUser) {
        alert(
            "Спочатку потрібно увійти або зареєструватися."
        );
        return;
    }

    if (isTopicsLocked()) {
        alert(
            "Доступ до тем закритий. Потрібна активна оплата на 6 тижнів."
        );

        showTopicsLockedMessage();

        return;
    }

    currentMode = "topic";
    currentTopic = topic;

    currentQuestionIndex = 0;
    score = 0;
    answered = false;

    currentTopicStarted = false;

    elapsedSeconds = 0;

    questionStartTime = null;

    stopTopicTimer();

    currentQuestions =
        allQuestions.filter(
            (q) => q.topic === topic
        );

    if (currentQuestions.length === 0) {
        const trainingSection =
            document.querySelector("#training");

        if (trainingSection) {
            trainingSection.innerHTML = `
                <h2>Іспит</h2>

                <div class="panel">
                    <p>
                        Для теми "${topic}"
                        ще немає питань.
                    </p>
                </div>
            `;
        }

        return;
    }

    if (!questionStates[currentTopic]) {
        questionStates[currentTopic] = {
            answers: {}
        };
    }

    const trainingSection =
        document.querySelector("#training");

    if (trainingSection) {
        trainingSection.innerHTML = `
            <h2>Тема: ${currentTopic}</h2>

            <div class="panel">
                <p>
                    У цій темі є
                    ${currentQuestions.length}
                    питань.
                </p>

                <p>
                    Натисни кнопку нижче,
                    щоб почати тест.
                </p>

                <button
                    class="btn btn-primary"
                    onclick="startTopic()"
                >
                    Старт
                </button>
            </div>
        `;

        trainingSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}


/* =========================================================
   START TOPIC
========================================================= */

function startTopic() {
    currentMode = "topic";
    currentTopicStarted = true;

    startTopicTimer();

    showQuestion();
}


/* =========================================================
   START EXAM
========================================================= */

function startExam() {
    if (!currentUser) {
        alert(
            "Спочатку потрібно увійти або зареєструватися."
        );
        return;
    }

    currentMode = "exam";
    currentTopic = "Екзамен";

    currentQuestionIndex = 0;
    score = 0;
    answered = false;

    currentTopicStarted = true;

    elapsedSeconds = 0;
    questionStartTime = null;

    stopTopicTimer();
    startTopicTimer();

    currentQuestions =
        getRandomQuestions(
            allQuestions,
            20
        );

    if (currentQuestions.length === 0) {
        const trainingSection =
            document.querySelector("#training");

        if (trainingSection) {
            trainingSection.innerHTML = `
                <h2>Іспит</h2>

                <div class="panel">
                    <p>
                        Питання для іспиту не знайдені.
                    </p>
                </div>
            `;
        }

        return;
    }

    questionStates[currentTopic] = {
        answers: {}
    };

    showQuestion();
}


/* =========================================================
   SHOW QUESTION
========================================================= */

function showQuestion() {
    answered = false;

    const question =
        currentQuestions[currentQuestionIndex];

    const trainingSection =
        document.querySelector("#training");

    if (
        !trainingSection ||
        !question
    ) {
        return;
    }

    const state =
        questionStates[currentTopic] ||
        {
            answers: {}
        };

    const savedAnswer =
        state.answers[currentQuestionIndex];

    const imageHtml =
        question.image
            ? `
                <img
                    src="${question.image}"
                    alt="Зображення до питання"
                    class="question-image"
                >
            `
            : "";

    const title =
        currentMode === "exam"
            ? "Іспит"
            : currentMode === "wrong"
                ? "Мої помилкові тести"
                : `Тема: ${currentTopic}`;

    trainingSection.innerHTML = `
        <h2>${title}</h2>

        <div class="panel quiz-box">

            <div class="quiz-header">

                <p class="question-counter">
                    Питання
                    ${currentQuestionIndex + 1}
                    з
                    ${currentQuestions.length}
                </p>

                <p class="question-counter">
                    Час:
                    <span id="topic-timer">
                        ${formatTime(elapsedSeconds)}
                    </span>
                </p>

            </div>

            <p class="question-text">
                ${question.question}
            </p>

            ${imageHtml}

            <div class="options">

                ${question.options
                    .map((option, index) => {

                        let extraClass = "";

                        if (
                            savedAnswer !== undefined
                        ) {

                            if (
                                index ===
                                question.correctAnswer
                            ) {
                                extraClass =
                                    "correct";
                            }

                            else if (
                                index ===
                                savedAnswer.selected &&
                                !savedAnswer.isCorrect
                            ) {
                                extraClass =
                                    "wrong";
                            }
                        }

                        return `
                            <button
                                class="option-btn ${extraClass}"
                                onclick="checkAnswer(${index})"
                            >
                                ${option}
                            </button>
                        `;
                    })
                    .join("")}

            </div>

            <div id="result"></div>

            <div class="nav-buttons">

                <button
                    class="nav-btn"
                    onclick="prevQuestion()"
                    ${currentQuestionIndex === 0
                        ? "disabled"
                        : ""}
                >
                    Назад
                </button>

                <button
                    id="nextBtn"
                    class="nav-btn"
                    style="display:none;"
                    onclick="nextQuestion()"
                >
                    Далі
                </button>

            </div>

            <div class="question-grid">

                ${currentQuestions
                    .map((_, index) => {

                        let cls =
                            "question-square";

                        if (
                            index ===
                            currentQuestionIndex
                        ) {
                            cls += " active";
                        }

                        if (
                            state.answers[index] !==
                            undefined
                        ) {
                            cls +=
                                state.answers[index]
                                    .isCorrect
                                    ? " correct-answer"
                                    : " wrong-answer";
                        }

                        return `
                            <button
                                class="${cls}"
                                onclick="goToQuestion(${index})"
                            >
                                ${index + 1}
                            </button>
                        `;
                    })
                    .join("")}

            </div>

        </div>
    `;


    /*
       ВАЖЛИВО:

       Якщо питання ще не було відмічене,
       запускаємо окремий таймер саме цього питання.

       Якщо воно вже було відмічене,
       таймер НЕ запускаємо заново.
    */

    if (savedAnswer === undefined) {
        startQuestionTimer();
    }


    /*
       Якщо відповідь уже була дана,
       показуємо її без повторного
       запису статистики.
    */

    if (savedAnswer !== undefined) {

        answered = true;

        const result =
            document.getElementById("result");

        const nextBtn =
            document.getElementById("nextBtn");

        const buttons =
            document.querySelectorAll(
                ".option-btn"
            );

        buttons.forEach(
            (button, index) => {

                button.disabled = true;

                if (
                    index ===
                    question.correctAnswer
                ) {
                    button.classList.add(
                        "correct"
                    );
                }

                if (
                    index ===
                    savedAnswer.selected &&
                    !savedAnswer.isCorrect
                ) {
                    button.classList.add(
                        "wrong"
                    );
                }
            }
        );

        result.innerHTML =
            savedAnswer.isCorrect
                ? `
                    <p
                        style="
                            color:#4ade80;
                            font-size:20px;
                        "
                    >
                        ✅ Правильно!
                    </p>
                `
                : `
                    <p
                        style="
                            color:#f87171;
                            font-size:20px;
                        "
                    >
                        ❌ Неправильно.
                    </p>
                `;

        nextBtn.style.display =
            "inline-block";
    }
}


/* =========================================================
   CHECK ANSWER
========================================================= */

async function checkAnswer(selectedIndex) {
    if (answered) return;

    answered = true;

    const question =
        currentQuestions[currentQuestionIndex];

    const buttons =
        document.querySelectorAll(
            ".option-btn"
        );

    const result =
        document.getElementById("result");

    const nextBtn =
        document.getElementById("nextBtn");

    const state =
        questionStates[currentTopic];

    const isCorrect =
        selectedIndex ===
        question.correctAnswer;


    /*
       =====================================================
       ГОЛОВНЕ ВИПРАВЛЕННЯ
       =====================================================

       Рахуємо тільки час ЦЬОГО питання.

       Наприклад:
       питання 1 = 5 секунд
       питання 2 = 7 секунд
       питання 3 = 4 секунди

       У Supabase потраплять:
       5
       7
       4

       А НЕ:
       5
       12
       16
    */

    const questionTimeSeconds =
        getCurrentQuestionTime();


    state.answers[currentQuestionIndex] = {
        selected: selectedIndex,
        isCorrect: isCorrect,

        // Зберігаємо час питання
        timeSpentSeconds:
            questionTimeSeconds
    };


    /*
       Записуємо саме час поточного питання.
    */

    await addStat(
        currentTopic,
        question.id,
        isCorrect,
        questionTimeSeconds
    );


    buttons.forEach(
        (button, index) => {

            button.disabled = true;

            if (
                index ===
                question.correctAnswer
            ) {
                button.classList.add(
                    "correct"
                );
            }

            if (
                index === selectedIndex &&
                !isCorrect
            ) {
                button.classList.add(
                    "wrong"
                );
            }
        }
    );


    if (isCorrect) {

        score++;

        result.innerHTML = `
            <p
                style="
                    color:#4ade80;
                    font-size:20px;
                "
            >
                ✅ Правильно!
            </p>
        `;

    } else {

        result.innerHTML = `
            <p
                style="
                    color:#f87171;
                    font-size:20px;
                "
            >
                ❌ Неправильно.
            </p>
        `;
    }


    /*
       Після відповіді зупиняємо
       логіку таймера конкретного питання.
    */

    questionStartTime = null;

    nextBtn.style.display =
        "inline-block";
}


/* =========================================================
   NEXT QUESTION
========================================================= */

function nextQuestion() {

    if (
        currentQuestionIndex <
        currentQuestions.length - 1
    ) {

        currentQuestionIndex++;

        showQuestion();

    } else {

        if (
            currentMode === "exam"
        ) {
            showExamResult();
        } else {
            showResult();
        }
    }
}


/* =========================================================
   PREVIOUS QUESTION
========================================================= */

function prevQuestion() {

    if (currentQuestionIndex > 0) {

        currentQuestionIndex--;

        showQuestion();
    }
}


/* =========================================================
   GO TO QUESTION
========================================================= */

function goToQuestion(index) {

    currentQuestionIndex = index;

    showQuestion();
}


/* =========================================================
   RESULT
========================================================= */

function showResult() {

    stopTopicTimer();

    questionStartTime = null;

    const trainingSection =
        document.querySelector("#training");

    if (!trainingSection) return;

    trainingSection.innerHTML = `
        <h2>
            ${
                currentMode === "wrong"
                    ? "Мої помилкові тести"
                    : `Тема: ${currentTopic}`
            }
        </h2>

        <div class="panel">

            <p>
                Тест завершено.
            </p>

            <p>
                Ваш результат:
                ${score}
                з
                ${currentQuestions.length}
            </p>

            <p>
                Витрачений час:
                ${formatTime(elapsedSeconds)}
            </p>

            <button
                class="nav-btn"
                onclick="location.href='topics.html'"
            >
                Повернутися до тем
            </button>

        </div>
    `;
}


/* =========================================================
   EXAM RESULT
========================================================= */

function showExamResult() {

    stopTopicTimer();

    questionStartTime = null;

    const trainingSection =
        document.querySelector("#training");

    if (!trainingSection) return;

    const wrongCount =
        currentQuestions.length - score;

    const passed =
        wrongCount <= 2;

    trainingSection.innerHTML = `
        <h2>
            Іспит завершено
        </h2>

        <div class="panel">

            <p>
                <strong>Результат:</strong>
                ${score}
                правильних із
                ${currentQuestions.length}
            </p>

            <p>
                <strong>Помилок:</strong>
                ${wrongCount}
            </p>

            <p>
                <strong>Статус:</strong>
                ${
                    passed
                        ? "✅ Успішно"
                        : "❌ Неуспішно"
                }
            </p>

            <p>
                <strong>
                    Умови проходження:
                </strong>
                максимум 2 помилки
            </p>

            <p>
                <strong>
                    Витрачений час:
                </strong>
                ${formatTime(elapsedSeconds)}
            </p>

            <button
                class="nav-btn"
                onclick="location.href='training.html'"
            >
                Пройти іспит ще раз
            </button>

            <button
                class="nav-btn"
                onclick="location.href='topics.html'"
            >
                Повернутися до тем
            </button>

        </div>
    `;
}


/* =========================================================
   OPEN TRAINING
========================================================= */

function openTraining() {

    if (!currentUser) {
        alert(
            "Спочатку потрібно увійти або зареєструватися."
        );

        return;
    }

    if (
        location.pathname.includes(
            "training.html"
        )
    ) {
        startExam();

    } else {

        location.href =
            "training.html";
    }
}


/* =========================================================
   STATISTICS
========================================================= */

async function renderStats() {

    const statsSection =
        document.querySelector("#stats");

    if (!statsSection) return;

    if (!currentUser) {

        statsSection.innerHTML = `
            <h2>Статистика</h2>

            <div class="panel">
                <p>
                    Спочатку потрібно увійти
                    або зареєструватися.
                </p>
            </div>
        `;

        return;
    }


    const stats =
        await loadUserStatsFromSupabase();


    /*
       Загальна статистика
    */

    const total =
        stats.length;

    const correct =
        stats.filter(
            (item) => item.correct
        ).length;

    const wrong =
        total - correct;

    const percent =
        total > 0
            ? Math.round(
                (correct / total) * 100
            )
            : 0;


    /*
       ТЕПЕР ЦІ ЧИСЛА — ЦЕ СУМА ЧАСУ
       ОКРЕМИХ ПИТАНЬ.
    */

    const totalTimeSeconds =
        stats.reduce(
            (sum, item) =>
                sum +
                (
                    Number(
                        item.timeSpentSeconds
                    ) || 0
                ),
            0
        );


    const averageTimeSeconds =
        total > 0
            ? Math.round(
                totalTimeSeconds / total
            )
            : 0;


    /*
       Статистика по темах
    */

    const topicStats = {};


    stats.forEach((item) => {

        if (!topicStats[item.topic]) {

            topicStats[item.topic] = {
                total: 0,
                correct: 0,
                wrong: 0,
                time: 0
            };
        }


        topicStats[item.topic].total++;


        topicStats[item.topic].time +=
            Number(
                item.timeSpentSeconds
            ) || 0;


        if (item.correct) {

            topicStats[item.topic]
                .correct++;

        } else {

            topicStats[item.topic]
                .wrong++;
        }
    });


    /*
       HTML статистики по темах
    */

    const topicStatsHtml =
        Object.keys(topicStats).length

            ? Object.entries(topicStats)
                .map(
                    ([topic, data]) => `
                        <div
                            class="panel"
                            style="margin-top:16px;"
                        >

                            <h3
                                style="
                                    margin-bottom:10px;
                                "
                            >
                                ${topic}
                            </h3>

                            <p>
                                Всього:
                                ${data.total}
                            </p>

                            <p>
                                Правильних:
                                ${data.correct}
                            </p>

                            <p>
                                Неправильних:
                                ${data.wrong}
                            </p>

                            <p>
                                Час:
                                ${formatTime(
                                    data.time
                                )}
                            </p>

                            <p>
                                Середній час:
                                ${
                                    data.total > 0
                                        ? formatTime(
                                            Math.round(
                                                data.time /
                                                data.total
                                            )
                                        )
                                        : "0 с"
                                }
                            </p>

                        </div>
                    `
                )
                .join("")

            : `
                <div class="panel">
                    <p>
                        Поки що немає даних
                        для статистики.
                    </p>
                </div>
            `;


    /*
       Історія відповідей
    */

    const historyHtml =
        stats.length

            ? `
                <h2
                    style="
                        margin-top:24px;
                    "
                >
                    Останні відповіді
                </h2>

                <div class="panel">

                    ${
                        stats
                            .slice(-10)
                            .reverse()
                            .map(
                                (item) => `
                                    <p>

                                        <strong>
                                            ${item.topic}
                                        </strong>

                                        —

                                        ${
                                            item.correct
                                                ? "✅ правильно"
                                                : "❌ неправильно"
                                        }

                                        —

                                        час:

                                        ${formatTime(
                                            Number(
                                                item.timeSpentSeconds
                                            ) || 0
                                        )}

                                    </p>
                                `
                            )
                            .join("")
                    }

                </div>
            `

            : "";


    /*
       Виводимо статистику
    */

    statsSection.innerHTML = `

        <h2>
            Статистика
        </h2>

        <div class="panel">

            <p>
                Всього відповідей:
                ${total}
            </p>

            <p>
                Правильних:
                ${correct}
            </p>

            <p>
                Неправильних:
                ${wrong}
            </p>

            <p>
                Успішність:
                ${percent}%
            </p>

            <p>
                Загальний час:
                ${formatTime(
                    totalTimeSeconds
                )}
            </p>

            <p>
                Середній час на відповідь:
                ${formatTime(
                    averageTimeSeconds
                )}
            </p>

        </div>


        <h2
            style="
                margin-top:24px;
            "
        >
            Статистика по темах
        </h2>

        ${topicStatsHtml}

        ${historyHtml}
    `;
}


/* =========================================================
   WRONG QUESTION
========================================================= */

function openWrongQuestion(questionId) {

    const question =
        allQuestions.find(
            (q) =>
                String(q.id) ===
                String(questionId)
        );

    if (!question) {

        alert(
            "Питання не знайдено."
        );

        return;
    }


    currentMode = "wrong";
    currentTopic = "wrong-tests";

    currentQuestions = [
        question
    ];

    currentQuestionIndex = 0;

    score = 0;
    answered = false;

    currentTopicStarted = true;

    elapsedSeconds = 0;
    questionStartTime = null;

    stopTopicTimer();
    startTopicTimer();


    if (
        !questionStates[currentTopic]
    ) {

        questionStates[currentTopic] = {
            answers: {}
        };

    } else {

        questionStates[currentTopic]
            .answers = {};
    }


    showQuestion();
}


/* =========================================================
   WRONG TESTS TRAINING
========================================================= */

async function startWrongTestsTraining() {

    if (!currentUser) return;


    if (
        !allQuestions ||
        allQuestions.length === 0
    ) {

        alert(
            "Питання ще завантажуються. " +
            "Спробуй ще раз за кілька секунд."
        );

        return;
    }


    const {
        data,
        error
    } = await supabaseClient
        .from("user_stats")
        .select("question_id")
        .eq(
            "user_id",
            currentUser.id
        )
        .eq(
            "correct",
            false
        );


    if (error) {

        console.error(
            "Не вдалося завантажити помилкові тести:",
            error
        );

        alert(
            "Помилка завантаження помилкових тестів."
        );

        return;
    }


    if (
        !data ||
        data.length === 0
    ) {

        alert(
            "У тебе немає помилкових тестів. Молодець!"
        );

        return;
    }


    const wrongIds =
        [
            ...new Set(
                data.map(
                    item =>
                        String(
                            item.question_id
                        )
                )
            )
        ];


    const wrongQuestions =
        allQuestions

            .filter(
                q =>
                    wrongIds.includes(
                        String(q.id)
                    )
            )

            .sort(
                (a, b) =>
                    Number(a.id) -
                    Number(b.id)
            );


    if (
        wrongQuestions.length === 0
    ) {

        alert(
            "Не вдалося знайти питання для повторення."
        );

        return;
    }


    currentMode = "wrong";
    currentTopic = "wrong-tests";

    currentQuestions =
        wrongQuestions;

    currentQuestionIndex = 0;

    score = 0;
    answered = false;

    currentTopicStarted = true;

    elapsedSeconds = 0;
    questionStartTime = null;

    stopTopicTimer();
    startTopicTimer();


    questionStates[currentTopic] = {
        answers: {}
    };


    showQuestion();
}


/* =========================================================
   OPEN STATS
========================================================= */

async function openStats() {

    if (!currentUser) {

        alert(
            "Спочатку потрібно увійти або зареєструватися."
        );

        return;
    }


    if (
        location.pathname.includes(
            "stats.html"
        )
    ) {

        await renderStats();

    } else {

        location.href =
            "stats.html";
    }
}


/* =========================================================
   TEACHER / ADMIN STUDENT DASHBOARD
========================================================= */

function formatDashboardDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString("uk-UA");
}

function renderTeacherDashboard(students, statsByUserId) {
    const tbody = document.getElementById("student-dashboard-rows");
    const summary = document.getElementById("student-dashboard-summary");
    const status = document.getElementById("student-dashboard-status");
    const isAdmin = currentProfile?.role === "admin";

    if (!tbody || !summary || !status) return;

    const refHeader = document.getElementById("student-dashboard-ref-header");
    const createdHeader = document.getElementById("student-dashboard-created-header");
    if (refHeader) refHeader.hidden = !isAdmin;
    if (createdHeader) createdHeader.hidden = !isAdmin;

    const now = Date.now();
    const isActive = (student) =>
        Boolean(student.paid_until) &&
        new Date(student.paid_until).getTime() > now;

    const sortedStudents = [...students].sort((a, b) => {
        const activeOrder = Number(isActive(b)) - Number(isActive(a));
        if (activeOrder !== 0) return activeOrder;

        return (a.full_name || "").localeCompare(
            b.full_name || "",
            "uk"
        );
    });

    const activeCount = sortedStudents.filter(isActive).length;
    summary.textContent =
        `Студентів: ${sortedStudents.length} · Активні підписки: ${activeCount}`;

    tbody.replaceChildren();

    if (sortedStudents.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = isAdmin ? 7 : 5;
        cell.className = "student-dashboard-empty";
        cell.textContent =
            currentProfile?.role === "teacher"
                ? "За вашим реферальним посиланням студентів поки немає."
                : "Студентських профілів поки немає.";
        row.appendChild(cell);
        tbody.appendChild(row);
        status.textContent = "";
        return;
    }

    for (const student of sortedStudents) {
        const row = document.createElement("tr");
        const stat = statsByUserId.get(student.user_id);
        const answered = Number(stat?.answered_count) || 0;
        const correct = Number(stat?.correct_count) || 0;
        const successText = answered > 0
            ? `${Math.round((correct / answered) * 100)}% (${correct}/${answered})`
            : "Ще немає відповідей";
        const active = isActive(student);
        const hasExpiredSubscription =
            Boolean(student.paid_until) &&
            new Date(student.paid_until).getTime() <= now;

        const values = [
            student.full_name || "Не вказано",
            student.email || "Не вказано"
        ];

        if (isAdmin) {
            values.push(
                student.teacher_ref_code || "—",
                formatDashboardDate(student.created_at)
            );
        }

        values.push(
            active
                ? "Активна"
                : hasExpiredSubscription
                    ? "Неактивна"
                    : "Немає оплати",
            formatDashboardDate(student.paid_until),
            successText
        );

        for (const value of values) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        }

        if (active) row.classList.add("student-dashboard-active");
        tbody.appendChild(row);
    }

    status.textContent = "";
}

async function loadTeacherDashboard() {
    const status = document.getElementById("student-dashboard-status");
    const title = document.getElementById("student-dashboard-title");
    const description = document.getElementById("student-dashboard-description");

    if (!status || !title || !description || !currentUser || !currentProfile) {
        return;
    }

    const isAdmin = currentProfile.role === "admin";
    title.textContent = isAdmin ? "Студенти" : "Мої студенти";
    description.textContent = isAdmin
        ? "Усі студентські профілі та їхні результати."
        : "Студенти, які зареєструвалися за вашим реферальним посиланням.";

    status.textContent = "Завантажуємо дані…";

    const [profilesResult, statsResult] = await Promise.all([
        supabaseClient
            .from("profiles")
            .select(isAdmin
                ? "user_id, full_name, email, paid_until, teacher_ref_code, created_at"
                : "user_id, full_name, email, paid_until")
            .eq("role", "student")
            .order("full_name", { ascending: true }),
        supabaseClient.rpc("get_student_success_summary")
    ]);

    if (profilesResult.error || statsResult.error) {
        console.error(
            "Не вдалося завантажити дані кабінету студентів:",
            profilesResult.error || statsResult.error
        );
        status.textContent =
            "Не вдалося завантажити дані. Спробуйте оновити сторінку.";
        return;
    }

    const statsByUserId = new Map(
        (statsResult.data || []).map((stat) => [stat.user_id, stat])
    );

    renderTeacherDashboard(
        profilesResult.data || [],
        statsByUserId
    );
}


/* =========================================================
   PROFILE
========================================================= */

async function refreshProfile() {

    if (!currentUser) return;


    const {
        data,
        error
    } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq(
            "user_id",
            currentUser.id
        )
        .single();


    if (error) {

        console.error(
            "Не вдалося завантажити профіль:",
            error
        );

        currentProfile = null;

        return;
    }


    currentProfile = data;
}


/* =========================================================
   REGISTER
========================================================= */

async function registerFromForm() {

    const name =
        document
            .getElementById("auth-name")
            .value
            .trim();

    const email =
        document
            .getElementById("auth-email")
            .value
            .trim();

    const password =
        document
            .getElementById("auth-password")
            .value
            .trim();

    const message =
        document.getElementById(
            "auth-message"
        );


    if (
        !name ||
        !email ||
        !password
    ) {

        message.textContent =
            "Заповни всі поля.";

        message.style.color =
            "#fca5a5";

        return;
    }


    const {
        data,
        error
    } = await supabaseClient.auth.signUp({
        email: email,
        password: password
    });


    if (error) {

        message.textContent =
            "Помилка реєстрації: " +
            error.message;

        message.style.color =
            "#fca5a5";

        return;
    }


    const user = data.user;


    if (!user) {

        message.textContent =
            "Реєстрація виконана, " +
            "але користувача не створено.";

        message.style.color =
            "#fca5a5";

        return;
    }


    const {
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .insert([
            {
                user_id: user.id,
                email: email,
                full_name: name,
                role: "student",
                created_at:
                    new Date().toISOString(),
                teacher_ref_code:
                    teacherRefCode,
                paid_until: null
            }
        ]);


    if (profileError) {

        message.textContent =
            "Профіль створено з помилкою: " +
            profileError.message;

        message.style.color =
            "#fca5a5";

        return;
    }


    message.style.color =
        "#86efac";

    message.textContent =
        "Реєстрація успішна. Тепер увійди.";
}


/* =========================================================
   LOGIN
========================================================= */

async function loginFromForm() {

    const email =
        document
            .getElementById("auth-email")
            .value
            .trim();

    const password =
        document
            .getElementById("auth-password")
            .value
            .trim();

    const message =
        document.getElementById(
            "auth-message"
        );


    if (
        !email ||
        !password
    ) {

        message.textContent =
            "Введи email і пароль.";

        message.style.color =
            "#fca5a5";

        return;
    }


    const {
        data,
        error
    } = await supabaseClient.auth
        .signInWithPassword({
            email: email,
            password: password
        });


    if (error) {

        message.textContent =
            "Помилка входу: " +
            error.message;

        message.style.color =
            "#fca5a5";

        return;
    }


    currentUser = data.user;

    await refreshProfile();
    await loadUserProfile();
    await applyAccessRulesAfterLogin();


    window.location.href =
        "index.html";
}


/* =========================================================
   ACCESS RULES
========================================================= */

async function applyAccessRulesAfterLogin() {

    if (!currentProfile) return;


    if (
        location.pathname.includes(
            "topics.html"
        ) &&
        isTopicsLocked()
    ) {

        showTopicsLockedMessage();
    }
}


/* =========================================================
   LOGOUT
========================================================= */

async function logoutUser() {

    const {
        error
    } = await supabaseClient.auth
        .signOut();


    if (error) {

        alert(
            "Помилка виходу: " +
            error.message
        );

        return;
    }


    currentUser = null;
    currentProfile = null;
    syncAuthNavigation();


    window.location.href =
        "index.html";
}


/* =========================================================
   AUTH UI
========================================================= */

function syncAuthNavigation() {
    const isSignedIn = Boolean(currentUser);

    document
        .querySelectorAll('.topbar .menu a[href="auth.html"]')
        .forEach((link) => {
            link.classList.toggle("auth-hidden", isSignedIn);
        });

    document
        .querySelectorAll('.topbar .menu a[onclick*="logoutUser"]')
        .forEach((link) => {
            link.classList.toggle("auth-visible", isSignedIn);
        });

    document
        .querySelectorAll(".topbar .menu .user-greeting")
        .forEach((greeting) => {
            greeting.classList.toggle("auth-visible", isSignedIn);

            if (!isSignedIn) {
                greeting.textContent = "";
            } else if (!greeting.textContent.trim()) {
                greeting.textContent = "Ви увійшли";
            }
        });

    syncPrivilegedDashboardNavigation();
}


function syncPrivilegedDashboardNavigation() {
    const mayViewStudents =
        Boolean(currentUser) &&
        Boolean(currentProfile) &&
        ["teacher", "admin"].includes(currentProfile.role);

    document
        .querySelectorAll(".topbar .menu")
        .forEach((menu) => {
            const existingLink = menu.querySelector(
                '[data-privileged-dashboard-link="true"]'
            );

            if (!mayViewStudents) {
                existingLink?.remove();
                return;
            }

            if (existingLink) return;

            const link = document.createElement("a");
            link.href = "teacher.html";
            link.dataset.privilegedDashboardLink = "true";
            link.textContent = "Студенти";

            const greeting = menu.querySelector(".user-greeting");
            menu.insertBefore(link, greeting || null);
        });
}
function showAuth() {

    const auth =
        document.getElementById(
            "auth-screen"
        );

    const app =
        document.getElementById(
            "app-content"
        );


    if (auth) {
        auth.style.display =
            "flex";
    }

    if (app) {
        app.style.display =
            "none";
    }
}


function showApp() {

    const auth =
        document.getElementById(
            "auth-screen"
        );

    const app =
        document.getElementById(
            "app-content"
        );


    if (auth) {
        auth.style.display =
            "none";
    }

    if (app) {
        app.style.display =
            "block";
    }
}


/* =========================================================
   USER PROFILE
========================================================= */

async function loadUserProfile() {

    if (!currentUser) return;


    if (!currentProfile) {
        await refreshProfile();
    }


    if (!currentProfile) return;


    const greeting =
        document.getElementById(
            "user-greeting"
        );


    if (greeting) {

        greeting.textContent =
            currentProfile.full_name
                ? `Вітаємо, ${currentProfile.full_name}`
                : "Вітаємо";
    }

    syncAuthNavigation();
}


/* =========================================================
   SUBSCRIPTION
========================================================= */

function formatSubscriptionStatus(
    paidUntil
) {

    if (!paidUntil) {

        return "Підписка ще не оформлена";
    }


    const now =
        new Date();

    const end =
        new Date(paidUntil);


    if (
        isNaN(
            end.getTime()
        )
    ) {

        return "Підписка ще не оформлена";
    }


    if (end <= now) {

        return `
            Підписка завершилась
            ${end.toLocaleDateString("uk-UA")}
        `;
    }


    const diffMs =
        end - now;


    const diffDays =
        Math.floor(
            diffMs /
            (
                1000 *
                60 *
                60 *
                24
            )
        );


    const diffHours =
        Math.floor(
            (
                diffMs %
                (
                    1000 *
                    60 *
                    60 *
                    24
                )
            ) /
            (
                1000 *
                60 *
                60
            )
        );


    return `
        Активна до
        ${end.toLocaleDateString("uk-UA")}
        —
        залишилось
        ${diffDays}
        дн.
        ${diffHours}
        год.
    `;
}


/* =========================================================
   PROFILE PAGE
========================================================= */

async function loadProfilePage() {

    const profileInfo =
        document.getElementById(
            "profile-info"
        );

    const profileMessage =
        document.getElementById(
            "profile-message"
        );


    if (!profileInfo) return;


    if (!currentUser) {

        profileInfo.innerHTML = `
            <p>
                Спочатку потрібно увійти
                або зареєструватися.
            </p>
        `;

        return;
    }


    if (!currentProfile) {
        await refreshProfile();
    }


    if (!currentProfile) {

        profileInfo.innerHTML = `
            <p>
                Не вдалося завантажити профіль.
            </p>
        `;

        return;
    }


    profileInfo.innerHTML = `
        <h2>
            Дані профілю
        </h2>

        <p>
            <strong>ПІБ:</strong>
            ${currentProfile.full_name || "Не вказано"}
        </p>

        <p>
            <strong>Email:</strong>
            ${currentProfile.email || "Не вказано"}
        </p>

        <p>
            <strong>Роль:</strong>
            ${currentProfile.role || "student"}
        </p>

        <p>
            <strong>Підписка:</strong>
            ${formatSubscriptionStatus(
                currentProfile.paid_until
            )}
        </p>
    `;


    if (profileMessage) {
        profileMessage.textContent = "";
    }
}


/* =========================================================
   CHANGE PASSWORD
========================================================= */

async function changePasswordFromForm() {

    const newPassword =
        document
            .getElementById(
                "new-password"
            )
            ?.value
            .trim();

    const confirmPassword =
        document
            .getElementById(
                "confirm-password"
            )
            ?.value
            .trim();

    const message =
        document.getElementById(
            "profile-message"
        );


    if (!message) return;


    if (!currentUser) {

        message.textContent =
            "Спочатку потрібно увійти.";

        message.style.color =
            "#fca5a5";

        return;
    }


    if (
        !newPassword ||
        !confirmPassword
    ) {

        message.textContent =
            "Заповни обидва поля.";

        message.style.color =
            "#fca5a5";

        return;
    }


    if (
        newPassword !==
        confirmPassword
    ) {

        message.textContent =
            "Паролі не збігаються.";

        message.style.color =
            "#fca5a5";

        return;
    }


    if (
        newPassword.length < 6
    ) {

        message.textContent =
            "Пароль має містити щонайменше 6 символів.";

        message.style.color =
            "#fca5a5";

        return;
    }


    const {
        error
    } = await supabaseClient.auth
        .updateUser({
            password: newPassword
        });


    if (error) {

        console.error(
            "Не вдалося змінити пароль:",
            error
        );

        message.textContent =
            "Не вдалося змінити пароль: " +
            error.message;

        message.style.color =
            "#fca5a5";

        return;
    }


    message.textContent =
        "Пароль успішно змінено.";

    message.style.color =
        "#86efac";


    document.getElementById(
        "new-password"
    ).value = "";

    document.getElementById(
        "confirm-password"
    ).value = "";
}


/* =========================================================
   CURRENT USER
========================================================= */

async function checkCurrentUser() {
    const { data } = await supabaseClient.auth.getUser();
    currentUser = data?.user || null;

    const isTeacherDashboard =
        window.location.pathname.endsWith("/teacher.html") ||
        window.location.pathname === "teacher.html";

    if (isTeacherDashboard && !currentUser) {
        window.location.replace("index.html");
        return;
    }

    syncAuthNavigation();
    showApp();

    if (currentUser) {
        await refreshProfile();
        syncAuthNavigation();

        if (
            isTeacherDashboard &&
            !["teacher", "admin"].includes(currentProfile?.role)
        ) {
            window.location.replace("index.html");
            return;
        }

        await loadUserProfile();

        if (location.pathname.includes("profile.html")) {
            await loadProfilePage();
        }

        if (location.pathname.includes("stats.html")) {
            await renderStats();
        }

        if (
            isTeacherDashboard &&
            ["teacher", "admin"].includes(currentProfile?.role)
        ) {
            await loadTeacherDashboard();
        }

        if (
            location.pathname.includes("topics.html") &&
            isTopicsLocked()
        ) {
            showTopicsLockedMessage();
        }
    }

    document.body.style.visibility = "visible";
}

/* =========================================================
   INITIALIZATION
========================================================= */

initReferralCode();

loadQuestions();

checkCurrentUser();
