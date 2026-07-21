let allQuestions = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let answered = false;
let currentTopic = "";
let questionStates = {}; // збереження відповідей по темі

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

function openTopic(topic) {
    currentTopic = topic;
    currentQuestionIndex = 0;
    score = 0;
    answered = false;

    currentQuestions = allQuestions.filter(q => q.topic === topic);

    if (currentQuestions.length === 0) {
        document.querySelector('#training').innerHTML = `
            <h2>Тренування</h2>
            <div class="panel">
                <p>Для теми "${topic}" ще немає питань.</p>
            </div>
        `;
        location.hash = '#training';
        return;
    }

    // створюємо сховище для цієї теми
    if (!questionStates[currentTopic]) {
        questionStates[currentTopic] = {
            answers: {}
        };
    }

    showQuestion();
    location.hash = '#training';
}

function showQuestion() {
    answered = false;
    const question = currentQuestions[currentQuestionIndex];
    const trainingSection = document.querySelector('#training');
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
            </div>

            <p class="question-text">${question.question}</p>
            ${imageHtml}

            <div class="options">
                ${question.options.map((option, index) => {
                    let extraClass = '';
                    if (savedAnswer !== undefined) {
                        if (index === question.correctAnswer) extraClass = 'correct';
                        else if (index === savedAnswer && savedAnswer !== question.correctAnswer) extraClass = 'wrong';
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
                    if (index === currentQuestionIndex) cls += ' active';
                    if (state.answers[index] !== undefined) cls += ' answered';
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
                button.style.background = '#22c55e';
                button.style.color = 'white';
            }
            if (index === savedAnswer && savedAnswer !== question.correctAnswer) {
                button.style.background = '#ef4444';
                button.style.color = 'white';
            }
        });

        result.innerHTML = savedAnswer === question.correctAnswer
            ? '<p style="color:#4ade80; font-size:20px;">✅ Правильно!</p>'
            : '<p style="color:#f87171; font-size:20px;">❌ Неправильно.</p>';

        nextBtn.style.display = 'inline-block';
    }
}

function checkAnswer(selectedIndex) {
    if (answered) return;

    answered = true;
    const question = currentQuestions[currentQuestionIndex];
    const buttons = document.querySelectorAll('.option-btn');
    const result = document.getElementById('result');
    const nextBtn = document.getElementById('nextBtn');
    const state = questionStates[currentTopic];

    state.answers[currentQuestionIndex] = selectedIndex;

    buttons.forEach((button, index) => {
        button.disabled = true;
        if (index === question.correctAnswer) {
            button.style.background = '#22c55e';
            button.style.color = 'white';
        }
        if (index === selectedIndex && selectedIndex !== question.correctAnswer) {
            button.style.background = '#ef4444';
            button.style.color = 'white';
        }
    });

    if (selectedIndex === question.correctAnswer) {
        score++;
        result.innerHTML = '<p style="color:#4ade80; font-size:20px;">✅ Правильно!</p>';
    } else {
        result.innerHTML = '<p style="color:#f87171; font-size:20px;">❌ Неправильно.</p>';
    }

    nextBtn.style.display = 'inline-block';

    // оновлюємо квадратики
    showQuestionCounterOnly();
}

function showQuestionCounterOnly() {
    // тут нічого не робимо окремо, бо повне оновлення вже відбудеться при переході
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
    const trainingSection = document.querySelector('#training');
    trainingSection.innerHTML = `
        <h2>Тема: ${currentTopic}</h2>
        <div class="panel">
            <p>Тест завершено.</p>
            <p>Ваш результат: ${score} з ${currentQuestions.length}</p>
            <button class="nav-btn" onclick="location.href='#topics'">Повернутися до тем</button>
        </div>
    `;
}

function openTraining() {
    alert("Оберіть тему на сторінці 'Теми'.");
}

loadQuestions();
