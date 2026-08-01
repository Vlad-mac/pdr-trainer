let allQuestions = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let answered = false;
let currentTopic = "";
let currentMode = "topic"; // "topic" або "exam"
let questionStates = {};
let currentTopicStarted = false;
let topicStartTime = null;
let topicTimerInterval = null;
let elapsedSeconds = 0;
let teacherRefCode = null;

const SUPABASE_URL = "https://tsqjfphauhphdksstbob.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hLnSso-oks7c2BNJyneiCA_oNIaGDLU";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

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
                <h2>Тренування</h2>
                <div class="panel">
                    <p>Не вдалося завантажити питання. Перевір файл questions.json.</p>
                </div>
            `;
        }
    }
}

async function loadUserStatsFromSupabase() {
    if (!currentUser) return [];

    const { data, error } = await supabaseClient
        .from("user_stats")
        .select("topic, question_id, correct, created_at, time_spent_seconds")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Не вдалося завантажити статистику з Supabase:", error);
        return [];
    }

    return (data || []).map((item) => ({
        topic: item.topic,
        questionId: item.question_id,
        correct: item.correct,
        timeSpentSeconds: item.time_spent_seconds,
        time: item.created_at,
    }));
}

async function addStat(topic, questionId, isCorrect) {
    if (!currentUser) return;

    console.log("ADD STAT CALL:", {
        user_id: currentUser.id,
        topic,
        questionId,
        questionIdString: String(questionId),
        isCorrect,
    });

    const { data, error } = await supabaseClient
        .from("user_stats")
        .upsert([
            {
                user_id: currentUser.id,
                topic: topic,
                question_id: String(questionId),
                correct: isCorrect,
                created_at: new Date().toISOString(),
                time_spent_seconds: elapsedSeconds,
            },
        ], {
            onConflict: "user_id,question_id"
        });

    console.log("UPSERT RESULT:", { data, error });

    if (error) {
        console.error("Не вдалося зберегти статистику в Supabase:", error);
    }
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startTopicTimer() {
    stopTopicTimer();
    topicStartTime = new Date();
    elapsedSeconds = 0;

    const timerEl = document.getElementById("topic-timer");
    if (timerEl) {
        timerEl.textContent = formatTime(elapsedSeconds);
    }

    topicTimerInterval = setInterval(() => {
        elapsedSeconds++;
        const timerEl = document.getElementById("topic-timer");
        if (timerEl) {
            timerEl.textContent = formatTime(elapsedSeconds);
        }
    }, 1000);
}

function stopTopicTimer() {
    if (topicTimerInterval) {
        clearInterval(topicTimerInterval);
        topicTimerInterval = null;
    }
}

function getRandomQuestions(sourceQuestions, count) {
    const shuffled = [...sourceQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

function hasPaidAccess(profile) {
    if (!profile) return false;
    if (profile.role === "teacher" || profile.role === "admin") return true;
    if (!profile.paid_until) return false;
    return new Date(profile.paid_until) > new Date();
}

function isTopicsLocked() {
    if (!currentProfile) return true;
    return !hasPaidAccess(currentProfile);
}

function showTopicsLockedMessage() {
    const lockedPanel = document.getElementById("topics-locked-panel");
    const topicsGrid = document.getElementById("topics-grid");
    const trainingSection = document.querySelector("#training");

    if (lockedPanel) lockedPanel.style.display = "block";
    if (topicsGrid) topicsGrid.style.display = "none";

    if (trainingSection) {
        trainingSection.innerHTML = `
            <h2>Доступ обмежено</h2>
            <div class="panel">
                <p>Для доступу до тем потрібна активна оплата на 6 тижнів.</p>
                <p>Викладачі та адмін мають доступ без оплати.</p>
                <button class="btn btn-primary" onclick="location.href='index.html'">На головну</button>
            </div>
        `;
    }
}

async function startPayment(event) {
    if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
    }
    if (event && typeof event.stopPropagation === "function") {
        event.stopPropagation();
    }

    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
            alert("Не вдалося отримати токен користувача.");
            return;
        }

        const response = await fetch(`${SUPABASE_URL}/functions/v1/start-payment-ts`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });

        const rawText = await response.text();
        console.log("start-payment raw response:", rawText);

        let data;
        try {
            data = JSON.parse(rawText);
            if (typeof data === "string") {
                data = JSON.parse(data);
            }
        } catch (parseError) {
            console.error("start-payment parse error:", parseError);
            alert("Сервер повернув некоректну відповідь.");
            return;
        }

        if (!response.ok) {
            console.error("start-payment error:", data);
            alert(data.message || "Не вдалося підготувати оплату.");
            return;
        }

        if (!data || data.status !== "ok" || !data.data) {
            alert("Некоректна відповідь від сервера оплати.");
            return;
        }

        const p = data.data;
        console.log("parsed payment data:", p);

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
            if (p[field] === undefined || p[field] === null) {
                console.error("Missing payment field:", field, p);
                alert(`Сервер не повернув поле ${field}.`);
                return;
            }
        }

        const form = document.createElement("form");
        form.method = "POST";
        form.action = "https://secure.wayforpay.com/pay";
        form.acceptCharset = "utf-8";
        form.target = "_blank";
        form.style.display = "none";

        const fields = {
            merchantAccount: String(p.merchantAccount || ""),
            merchantAuthType: String(p.merchantAuthType || "SimpleSignature"),
            merchantDomainName: String(p.merchantDomainName || ""),
            orderReference: String(p.orderReference || ""),
            orderDate: String(p.orderDate || ""),
            amount: String(p.amount || ""),
            currency: String(p.currency || ""),
            productName: Array.isArray(p.productName) ? String(p.productName[0] || "") : String(p.productName || ""),
            productPrice: Array.isArray(p.productPrice) ? String(p.productPrice[0] || "") : String(p.productPrice || ""),
            productCount: Array.isArray(p.productCount) ? String(p.productCount[0] || "") : String(p.productCount || ""),
            merchantSignature: String(p.merchantSignature || ""),
            clientFirstName: String(p.clientFirstName || ""),
            clientLastName: String(p.clientLastName || ""),
            clientEmail: String(p.clientEmail || ""),
            language: String(p.language || "UA"),
            serviceUrl: String(p.serviceUrl || ""),
            returnUrl: String(p.returnUrl || "")
        };

        Object.entries(fields).forEach(([key, value]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = value;
            form.appendChild(input);
        });

        document.body.appendChild(form);

        console.log("Submitting to:", form.action);
        console.log("Form HTML:", form.outerHTML);

        form.submit();
    } catch (err) {
        console.error("Payment error:", err);
        alert("Помилка запуску оплати.");
    }
}

function openTopic(topic) {
    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    if (isTopicsLocked()) {
        alert("Доступ до тем закритий. Потрібна активна оплата на 6 тижнів.");
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
    stopTopicTimer();

    currentQuestions = allQuestions.filter((q) => q.topic === topic);

    if (currentQuestions.length === 0) {
        const trainingSection = document.querySelector("#training");
        if (trainingSection) {
            trainingSection.innerHTML = `
                <h2>Тренування</h2>
                <div class="panel">
                    <p>Для теми "${topic}" ще немає питань.</p>
                </div>
            `;
        }
        return;
    }

    if (!questionStates[currentTopic]) {
        questionStates[currentTopic] = {
            answers: {},
        };
    }

    const trainingSection = document.querySelector("#training");
    if (trainingSection) {
        trainingSection.innerHTML = `
            <h2>Тема: ${currentTopic}</h2>
            <div class="panel">
                <p>У цій темі є ${currentQuestions.length} питань.</p>
                <p>Натисни кнопку нижче, щоб почати тест.</p>
                <button class="btn btn-primary" onclick="startTopic()">Старт</button>
            </div>
        `;
        trainingSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function startTopic() {
    currentMode = "topic";
    currentTopicStarted = true;
    startTopicTimer();
    showQuestion();
}

function startExam() {
    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    currentMode = "exam";
    currentTopic = "Екзамен";
    currentQuestionIndex = 0;
    score = 0;
    answered = false;
    currentTopicStarted = true;
    elapsedSeconds = 0;
    stopTopicTimer();
    startTopicTimer();

    currentQuestions = getRandomQuestions(allQuestions, 20);

    if (currentQuestions.length === 0) {
        const trainingSection = document.querySelector("#training");
        if (trainingSection) {
            trainingSection.innerHTML = `
                <h2>Іспит</h2>
                <div class="panel">
                    <p>Питання для іспиту не знайдені.</p>
                </div>
            `;
        }
        return;
    }

    questionStates[currentTopic] = {
        answers: {},
    };

    showQuestion();
}

function showQuestion() {
    answered = false;

    const question = currentQuestions[currentQuestionIndex];
    const trainingSection = document.querySelector("#training");
    if (!trainingSection || !question) return;

    const state = questionStates[currentTopic] || { answers: {} };
    const savedAnswer = state.answers[currentQuestionIndex];

    const imageHtml = question.image ? `<img src="${question.image}" alt="Зображення до питання" class="question-image">` : "";

    const title = currentMode === "exam"
    ? "Іспит"
    : currentMode === "wrong"
        ? "Мої помилкові тести"
        : `Тема: ${currentTopic}`;

    trainingSection.innerHTML = `
        <h2>${title}</h2>
        <div class="panel quiz-box">
            <div class="quiz-header">
                <p class="question-counter">Питання ${currentQuestionIndex + 1} з ${currentQuestions.length}</p>
                <p class="question-counter">Час: <span id="topic-timer">${formatTime(elapsedSeconds)}</span></p>
            </div>

            <p class="question-text">${question.question}</p>
            ${imageHtml}

            <div class="options">
                ${question.options
                    .map((option, index) => {
                        let extraClass = "";
                        if (savedAnswer !== undefined) {
                            if (index === question.correctAnswer) extraClass = "correct";
                            else if (index === savedAnswer.selected && !savedAnswer.isCorrect) extraClass = "wrong";
                        }

                        return `
                            <button class="option-btn ${extraClass}" onclick="checkAnswer(${index})">
                                ${option}
                            </button>
                        `;
                    })
                    .join("")}
            </div>

            <div id="result"></div>

            <div class="nav-buttons">
                <button class="nav-btn" onclick="prevQuestion()" ${currentQuestionIndex === 0 ? "disabled" : ""}>Назад</button>
                <button id="nextBtn" class="nav-btn" style="display:none;" onclick="nextQuestion()">Далі</button>
            </div>

            <div class="question-grid">
                ${currentQuestions
                    .map((_, index) => {
                        let cls = "question-square";

                        if (index === currentQuestionIndex) {
                            cls += " active";
                        }

                        if (state.answers[index] !== undefined) {
                            cls += state.answers[index].isCorrect ? " correct-answer" : " wrong-answer";
                        }

                        return `
                            <button class="${cls}" onclick="goToQuestion(${index})">
                                ${index + 1}
                            </button>
                        `;
                    })
                    .join("")}
            </div>
        </div>
    `;

    if (savedAnswer !== undefined) {
        answered = true;

        const result = document.getElementById("result");
        const nextBtn = document.getElementById("nextBtn");
        const buttons = document.querySelectorAll(".option-btn");

        buttons.forEach((button, index) => {
            button.disabled = true;
            if (index === question.correctAnswer) button.classList.add("correct");
            if (index === savedAnswer.selected && !savedAnswer.isCorrect) button.classList.add("wrong");
        });

        result.innerHTML = savedAnswer.isCorrect
            ? '<p style="color:#4ade80; font-size:20px;">✅ Правильно!</p>'
            : '<p style="color:#f87171; font-size:20px;">❌ Неправильно.</p>';

        nextBtn.style.display = "inline-block";
    }
}

async function checkAnswer(selectedIndex) {
    if (answered) return;

    answered = true;

    const question = currentQuestions[currentQuestionIndex];
    const buttons = document.querySelectorAll(".option-btn");
    const result = document.getElementById("result");
    const nextBtn = document.getElementById("nextBtn");
    const state = questionStates[currentTopic];

    const isCorrect = selectedIndex === question.correctAnswer;

    state.answers[currentQuestionIndex] = {
        selected: selectedIndex,
        isCorrect: isCorrect,
    };

    await addStat(currentTopic, question.id, isCorrect);

    buttons.forEach((button, index) => {
        button.disabled = true;
        if (index === question.correctAnswer) button.classList.add("correct");
        if (index === selectedIndex && !isCorrect) button.classList.add("wrong");
    });

    if (isCorrect) {
        score++;
        result.innerHTML = '<p style="color:#4ade80; font-size:20px;">✅ Правильно!</p>';
    } else {
        result.innerHTML = '<p style="color:#f87171; font-size:20px;">❌ Неправильно.</p>';
    }

    nextBtn.style.display = "inline-block";
}

function nextQuestion() {
    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        showQuestion();
    } else {
        if (currentMode === "exam") showExamResult();
        else showResult();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        showQuestion();
    }
}

function goToQuestion(index) {
    currentQuestionIndex = index;
    showQuestion();
}

function showResult() {
    stopTopicTimer();

    const trainingSection = document.querySelector("#training");
    if (!trainingSection) return;

    trainingSection.innerHTML = `
        <h2>Тема: ${currentTopic}</h2>
        <div class="panel">
            <p>Тест завершено.</p>
            <p>Ваш результат: ${score} з ${currentQuestions.length}</p>
            <p>Витрачений час: ${formatTime(elapsedSeconds)}</p>
            <button class="nav-btn" onclick="location.href='topics.html'">Повернутися до тем</button>
        </div>
    `;
}

function showExamResult() {
    stopTopicTimer();

    const trainingSection = document.querySelector("#training");
    if (!trainingSection) return;

    const wrongCount = currentQuestions.length - score;
    const passed = wrongCount <= 2;

    trainingSection.innerHTML = `
        <h2>Іспит завершено</h2>
        <div class="panel">
            <p><strong>Результат:</strong> ${score} правильних із ${currentQuestions.length}</p>
            <p><strong>Помилок:</strong> ${wrongCount}</p>
            <p><strong>Статус:</strong> ${passed ? "✅ Успішно" : "❌ Неуспішно"}</p>
            <p><strong>Умови проходження:</strong> максимум 2 помилки</p>
            <p><strong>Витрачений час:</strong> ${formatTime(elapsedSeconds)}</p>
            <button class="nav-btn" onclick="location.href='training.html'">Пройти іспит ще раз</button>
            <button class="nav-btn" onclick="location.href='topics.html'">Повернутися до тем</button>
        </div>
    `;
}

function openTraining() {
    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    if (location.pathname.includes("training.html")) {
        startExam();
    } else {
        location.href = "training.html";
    }
}

async function renderStats() {
    const statsSection = document.querySelector("#stats");
    if (!statsSection) return;

    if (!currentUser) {
        statsSection.innerHTML = `
            <h2>Статистика</h2>
            <div class="panel">
                <p>Спочатку потрібно увійти або зареєструватися.</p>
            </div>
        `;
        return;
    }

    const stats = await loadUserStatsFromSupabase();

    const total = stats.length;
    const correct = stats.filter((item) => item.correct).length;
    const wrong = total - correct;
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

    const totalTimeSeconds = stats.reduce((sum, item) => sum + (Number(item.timeSpentSeconds) || 0), 0);
    const averageTimeSeconds = total > 0 ? Math.round(totalTimeSeconds / total) : 0;

    const topicStats = {};
    stats.forEach((item) => {
        if (!topicStats[item.topic]) {
            topicStats[item.topic] = { total: 0, correct: 0, wrong: 0, time: 0 };
        }
        topicStats[item.topic].total++;
        topicStats[item.topic].time += Number(item.timeSpentSeconds) || 0;
        if (item.correct) topicStats[item.topic].correct++;
        else topicStats[item.topic].wrong++;
    });

    const topicStatsHtml = Object.keys(topicStats).length
        ? Object.entries(topicStats)
              .map(
                  ([topic, data]) => `
            <div class="panel" style="margin-top:16px;">
                <h3 style="margin-bottom:10px;">${topic}</h3>
                <p>Всього: ${data.total}</p>
                <p>Правильних: ${data.correct}</p>
                <p>Неправильних: ${data.wrong}</p>
                <p>Час: ${formatTime(data.time)}</p>
            </div>
        `
              )
              .join("")
        : '<div class="panel"><p>Поки що немає даних для статистики.</p></div>';

    const historyHtml = stats.length
        ? `
            <h2 style="margin-top:24px;">Останні відповіді</h2>
            <div class="panel">
                ${stats
                    .slice(-10)
                    .reverse()
                    .map(
                        (item) => `
                    <p>
                        <strong>${item.topic}</strong> — 
                        ${item.correct ? "✅ правильно" : "❌ неправильно"} — 
                        час: ${formatTime(Number(item.timeSpentSeconds) || 0)}
                    </p>
                `
                    )
                    .join("")}
            </div>
        `
        : "";

    statsSection.innerHTML = `
        <h2>Статистика</h2>
        <div class="panel">
            <p>Всього відповідей: ${total}</p>
            <p>Правильних: ${correct}</p>
            <p>Неправильних: ${wrong}</p>
            <p>Успішність: ${percent}%</p>
            <p>Загальний час: ${formatTime(totalTimeSeconds)}</p>
            <p>Середній час на відповідь: ${formatTime(averageTimeSeconds)}</p>
        </div>

        <h2 style="margin-top:24px;">Статистика по темах</h2>
        ${topicStatsHtml}

        ${historyHtml}
    `;
}

async function loadWrongTests() {
    if (!currentUser) return;

    const container = document.getElementById("wrong-tests");
    if (!container) return;

    container.innerHTML = `
        <div class="panel">
            <p>Завантаження помилкових тестів...</p>
        </div>
    `;

    const { data, error } = await supabaseClient
        .from("user_stats")
        .select("topic, question_id, correct, created_at, time_spent_seconds")
        .eq("user_id", currentUser.id)
        .eq("correct", false)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Не вдалося завантажити помилкові тести:", error);
        container.innerHTML = `
            <div class="panel">
                <p>Помилка завантаження помилкових тестів.</p>
            </div>
        `;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="panel">
                <p>У тебе ще немає неправильних відповідей. Молодець!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
    <div class="panel">
        ${data.map(item => {
            const question = allQuestions.find((q) => String(q.id) === String(item.question_id));
            const title = question ? question.question : `Питання ID ${item.question_id}`;

            return `
                <button class="btn btn-primary" style="display:block; width:100%; margin-bottom:10px;"
                        onclick="openWrongQuestion('${item.question_id}')">
                    ${title}
                </button>
            `;
        }).join("")}
    </div>
`;
}

function openWrongQuestion(questionId) {
    const question = allQuestions.find((q) => String(q.id) === String(questionId));
    if (!question) {
        alert("Питання не знайдено.");
        return;
    }

    currentMode = "wrong";
    currentTopic = `wrong-${questionId}`;
    currentQuestions = [question];
    currentQuestionIndex = 0;
    score = 0;
    answered = false;
    currentTopicStarted = true;
    elapsedSeconds = 0;
    stopTopicTimer();
    startTopicTimer();

    if (!questionStates[currentTopic]) {
        questionStates[currentTopic] = { answers: {} };
    }

    showQuestion();
}

async function openStats() {
    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    if (location.pathname.includes("stats.html")) {
        await renderStats();
    } else {
        location.href = "stats.html";
    }
}

async function refreshProfile() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient.from("profiles").select("*").eq("user_id", currentUser.id).single();

    if (error) {
        console.error("Не вдалося завантажити профіль:", error);
        currentProfile = null;
        return;
    }

    currentProfile = data;
}

async function registerFromForm() {
    const name = document.getElementById("auth-name").value.trim();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value.trim();
    const message = document.getElementById("auth-message");

    if (!name || !email || !password) {
        message.textContent = "Заповни всі поля.";
        message.style.color = "#fca5a5";
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        message.textContent = "Помилка реєстрації: " + error.message;
        message.style.color = "#fca5a5";
        return;
    }

    const user = data.user;
    if (!user) {
        message.textContent = "Реєстрація виконана, але користувача не створено.";
        message.style.color = "#fca5a5";
        return;
    }

    const { error: profileError } = await supabaseClient.from("profiles").insert([
        {
            user_id: user.id,
            email: email,
            full_name: name,
            role: "student",
            created_at: new Date().toISOString(),
            teacher_ref_code: teacherRefCode,
            paid_until: null,
        },
    ]);

    if (profileError) {
        message.textContent = "Профіль створено з помилкою: " + profileError.message;
        message.style.color = "#fca5a5";
        return;
    }

    message.style.color = "#86efac";
    message.textContent = "Реєстрація успішна. Тепер увійди.";
}

async function loginFromForm() {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value.trim();
    const message = document.getElementById("auth-message");

    if (!email || !password) {
        message.textContent = "Введи email і пароль.";
        message.style.color = "#fca5a5";
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        message.textContent = "Помилка входу: " + error.message;
        message.style.color = "#fca5a5";
        return;
    }

    currentUser = data.user;
    await refreshProfile();
    await loadUserProfile();
    await applyAccessRulesAfterLogin();

    window.location.href = "index.html";
}

async function applyAccessRulesAfterLogin() {
    if (!currentProfile) return;

    if (location.pathname.includes("topics.html") && isTopicsLocked()) {
        showTopicsLockedMessage();
    }
}

async function logoutUser() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert("Помилка виходу: " + error.message);
        return;
    }

    currentUser = null;
    currentProfile = null;

    window.location.href = "index.html";
}

function showAuth() {
    const auth = document.getElementById("auth-screen");
    const app = document.getElementById("app-content");

    if (auth) auth.style.display = "flex";
    if (app) app.style.display = "none";
}

function showApp() {
    const auth = document.getElementById("auth-screen");
    const app = document.getElementById("app-content");

    if (auth) auth.style.display = "none";
    if (app) app.style.display = "block";
}

async function loadUserProfile() {
    if (!currentUser) return;

    if (!currentProfile) {
        await refreshProfile();
    }

    if (!currentProfile) return;

    const greeting = document.getElementById("user-greeting");
    if (greeting) {
        greeting.textContent = currentProfile.full_name ? `Вітаємо, ${currentProfile.full_name}` : "Вітаємо";
    }
}

async function checkCurrentUser() {
    const { data } = await supabaseClient.auth.getUser();
    currentUser = data.user;

    showApp();

    if (currentUser) {
        await refreshProfile();
        await loadUserProfile();

        if (location.pathname.includes("stats.html")) {
            await renderStats();
        }

        if (location.pathname.includes("topics.html") && isTopicsLocked()) {
            showTopicsLockedMessage();
        }
    }

    document.body.style.visibility = "visible";
}

initReferralCode();
loadQuestions();
checkCurrentUser();
