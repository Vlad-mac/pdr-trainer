let allQuestions = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let answered = false;
let currentTopic = "";
let questionStates = {};
let currentTopicStarted = false;
let topicStartTime = null;
let topicTimerInterval = null;
let elapsedSeconds = 0;

const SUPABASE_URL = "https://tsqjfphauhphdksstbob.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hLnSso-oks7c2BNJyneiCA_oNIaGDLU";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

async function loadQuestions() {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) {
            throw new Error('Не вдалося завантажити questions.json');
        }

        allQuestions = await response.json();
    } catch (error) {
        console.error('Помилка завантаження питань:', error);

        const trainingSection = document.querySelector('#training');
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
        .from('user_stats')
        .select('topic, question_id, correct, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Не вдалося завантажити статистику з Supabase:', error);
        return [];
    }

    return (data || []).map(item => ({
        topic: item.topic,
        questionId: item.question_id,
        correct: item.correct,
        time: item.created_at
    }));
}

async function addStat(topic, questionId, isCorrect) {
    if (!currentUser) return;

    const time = new Date().toISOString();

    const { error } = await supabaseClient
        .from('user_stats')
        .insert([
            {
                user_id: currentUser.id,
                topic: topic,
                question_id: String(questionId),
                correct: isCorrect,
                created_at: time,
                time_spent_seconds: elapsedSeconds
            }
        ]);

    if (error) {
        console.error('Не вдалося зберегти статистику в Supabase:', error);
    }
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startTopicTimer() {
    stopTopicTimer();
    topicStartTime = new Date();
    elapsedSeconds = 0;

    topicTimerInterval = setInterval(() => {
        elapsedSeconds++;
        const timerEl = document.getElementById('topic-timer');
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

function openTopic(topic) {
    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    currentTopic = topic;
    currentQuestionIndex = 0;
    score = 0;
    answered = false;
    currentTopicStarted = false;
    elapsedSeconds = 0;
    stopTopicTimer();

    currentQuestions = allQuestions.filter(q => q.topic === topic);

    if (currentQuestions.length === 0) {
        const trainingSection = document.querySelector('#training');
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
            answers: {}
        };
    }

    const trainingSection = document.querySelector('#training');
    if (trainingSection) {
        trainingSection.innerHTML = `
            <h2>Тема: ${currentTopic}</h2>
            <div class="panel">
                <p>У цій темі є ${currentQuestions.length} питань.</p>
                <p>Натисни кнопку нижче, щоб почати тест.</p>
                <button class="btn btn-primary" onclick="startTopic()">Старт</button>
            </div>
        `;
        trainingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function startTopic() {
    currentTopicStarted = true;
    startTopicTimer();
    showQuestion();
}

function showQuestion() {
    answered = false;

    const question = currentQuestions[currentQuestionIndex];
    const trainingSection = document.querySelector('#training');
    if (!trainingSection || !question) return;

    const state = questionStates[currentTopic];
    const savedAnswer = state.answers[currentQuestionIndex];

    const imageHtml = question.image
        ? `<img src="${question.image}" alt="Зображення до питання" class="question-image">`
        : '';

    trainingSection.innerHTML = `
        <h2>Тема: ${currentTopic}</h2>
        <div class="panel quiz-box">
            <div class="quiz-header">
                <p class="question-counter">Питання ${currentQuestionIndex + 1} з ${currentQuestions.length}</p>
                <p class="question-counter">Час: <span id="topic-timer">${formatTime(elapsedSeconds)}</span></p>
            </div>

            <p class="question-text">${question.question}</p>
            ${imageHtml}

            <div class="options">
                ${question.options.map((option, index) => {
                    let extraClass = '';
                    if (savedAnswer !== undefined) {
                        if (index === question.correctAnswer) extraClass = 'correct';
                        else if (index === savedAnswer.selected && !savedAnswer.isCorrect) extraClass = 'wrong';
                    }

                    return `
                        <button class="option-btn ${extraClass}" onclick="checkAnswer(${index})">
                            ${option}
                        </button>
                    `;
                }).join('')}
            </div>

            <div id="result"></div>

            <div class="nav-buttons">
                <button class="nav-btn" onclick="prevQuestion()" ${currentQuestionIndex === 0 ? 'disabled' : ''}>Назад</button>
                <button id="nextBtn" class="nav-btn" style="display:none;" onclick="nextQuestion()">Далі</button>
            </div>

            <div class="question-grid">
                ${currentQuestions.map((_, index) => {
                    let cls = 'question-square';

                    if (index === currentQuestionIndex) {
                        cls += ' active';
                    }

                    if (state.answers[index] !== undefined) {
                        cls += state.answers[index].isCorrect ? ' correct-answer' : ' wrong-answer';
                    }

                    return `
                        <button class="${cls}" onclick="goToQuestion(${index})">
                            ${index + 1}
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    if (savedAnswer !== undefined) {
        answered = true;

        const result = document.getElementById('result');
        const nextBtn = document.getElementById('nextBtn');
        const buttons = document.querySelectorAll('.option-btn');

        buttons.forEach((button, index) => {
            button.disabled = true;
            if (index === question.correctAnswer) {
                button.classList.add('correct');
            }
            if (index === savedAnswer.selected && !savedAnswer.isCorrect) {
                button.classList.add('wrong');
            }
        });

        result.innerHTML = savedAnswer.isCorrect
            ? '<p style="color:#4ade80; font-size:20px;">✅ Правильно!</p>'
            : '<p style="color:#f87171; font-size:20px;">❌ Неправильно.</p>';

        nextBtn.style.display = 'inline-block';
    }
}

async function checkAnswer(selectedIndex) {
    if (answered) return;

    answered = true;

    const question = currentQuestions[currentQuestionIndex];
    const buttons = document.querySelectorAll('.option-btn');
    const result = document.getElementById('result');
    const nextBtn = document.getElementById('nextBtn');
    const state = questionStates[currentTopic];

    const isCorrect = selectedIndex === question.correctAnswer;

    state.answers[currentQuestionIndex] = {
        selected: selectedIndex,
        isCorrect: isCorrect
    };

    await addStat(currentTopic, question.id, isCorrect);

    buttons.forEach((button, index) => {
        button.disabled = true;
        if (index === question.correctAnswer) {
            button.classList.add('correct');
        }
        if (index === selectedIndex && !isCorrect) {
            button.classList.add('wrong');
        }
    });

    if (isCorrect) {
        score++;
        result.innerHTML = '<p style="color:#4ade80; font-size:20px;">✅ Правильно!</p>';
    } else {
        result.innerHTML = '<p style="color:#f87171; font-size:20px;">❌ Неправильно.</p>';
    }

    nextBtn.style.display = 'inline-block';
}

function nextQuestion() {
    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        showQuestion();
    } else {
        showResult();
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

    const trainingSection = document.querySelector('#training');
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

function openTraining() {
    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    location.href = 'topics.html';
}

async function renderStats() {
    const statsSection = document.querySelector('#stats');
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
    const correct = stats.filter(item => item.correct).length;
    const wrong = total - correct;
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

    const totalTimeSeconds = stats.reduce((sum, item) => {
        return sum + (Number(item.timeSpentSeconds) || 0);
    }, 0);

    const averageTimeSeconds = total > 0 ? Math.round(totalTimeSeconds / total) : 0;

    const topicStats = {};
    stats.forEach(item => {
        if (!topicStats[item.topic]) {
            topicStats[item.topic] = {
                total: 0,
                correct: 0,
                wrong: 0,
                time: 0
            };
        }

        topicStats[item.topic].total++;
        topicStats[item.topic].time += Number(item.timeSpentSeconds) || 0;

        if (item.correct) {
            topicStats[item.topic].correct++;
        } else {
            topicStats[item.topic].wrong++;
        }
    });

    const topicStatsHtml = Object.keys(topicStats).length
        ? Object.entries(topicStats).map(([topic, data]) => `
            <div class="panel" style="margin-top:16px;">
                <h3 style="margin-bottom:10px;">${topic}</h3>
                <p>Всього: ${data.total}</p>
                <p>Правильних: ${data.correct}</p>
                <p>Неправильних: ${data.wrong}</p>
                <p>Час: ${formatTime(data.time)}</p>
            </div>
        `).join('')
        : '<div class="panel"><p>Поки що немає даних для статистики.</p></div>';

    const historyHtml = stats.length
        ? `
            <h2 style="margin-top:24px;">Останні відповіді</h2>
            <div class="panel">
                ${stats.slice(-10).reverse().map(item => `
                    <p>
                        <strong>${item.topic}</strong> — 
                        ${item.correct ? '✅ правильно' : '❌ неправильно'} — 
                        час: ${formatTime(Number(item.timeSpentSeconds) || 0)}
                    </p>
                `).join('')}
            </div>
        `
        : '';

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

async function openStats() {
    if (!currentUser) {
        alert("Спочатку потрібно увійти або зареєструватися.");
        return;
    }

    if (location.pathname.includes('stats.html')) {
        await renderStats();
    } else {
        location.href = 'stats.html';
    }
}

async function registerFromForm() {
    const name = document.getElementById('auth-name').value.trim();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const message = document.getElementById('auth-message');

    if (!name || !email || !password) {
        message.textContent = "Заповни всі поля.";
        message.style.color = "#fca5a5";
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
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

    const { error: profileError } = await supabaseClient
        .from('profiles')
        .insert([
            {
                user_id: user.id,
                email: email,
                full_name: name,
                role: 'student',
                created_at: new Date().toISOString()
            }
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
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const message = document.getElementById('auth-message');

    if (!email || !password) {
        message.textContent = "Введи email і пароль.";
        message.style.color = "#fca5a5";
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        message.textContent = "Помилка входу: " + error.message;
        message.style.color = "#fca5a5";
        return;
    }

    currentUser = data.user;
    await loadUserProfile();
    showApp();
}

async function logoutUser() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert("Помилка виходу: " + error.message);
        return;
    }

    currentUser = null;
    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = '';
    showAuth();
}

function showAuth() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app-content');

    if (auth) auth.style.display = 'flex';
    if (app) app.style.display = 'none';
}

function showApp() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app-content');

    if (auth) auth.style.display = 'none';
    if (app) app.style.display = 'block';
}

async function loadUserProfile() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('user_id', currentUser.id)
        .single();

    if (error) {
        console.error('Не вдалося завантажити профіль:', error);
        return;
    }

    const greeting = document.getElementById('user-greeting');
    if (greeting) {
        greeting.textContent = data.full_name ? `Вітаємо, ${data.full_name}` : 'Вітаємо';
    }
}

async function checkCurrentUser() {
    const { data } = await supabaseClient.auth.getUser();
    currentUser = data.user;

    if (currentUser) {
        await loadUserProfile();
        showApp();

        if (location.pathname.includes('stats.html')) {
            await renderStats();
        }
    } else {
        showAuth();
    }

    document.body.style.visibility = 'visible';
}

loadQuestions();
checkCurrentUser();
