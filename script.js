let allQuestions = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let answered = false;
let currentTopic = "";

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

    showQuestion();
    location.hash = '#training';
}

function showQuestion() {
    answered = false;
    const question = currentQuestions[currentQuestionIndex];
    const trainingSection = document.querySelector('#training');

    const imageHtml = question.image
        ? `<img src="${question.image}" alt="Зображення до питання" class="question-image">`
        : '';

    trainingSection.innerHTML = `
        <h2>Тема: ${currentTopic}</h2>
        <div class="panel quiz-box">
            <p class="question-text">${question.question}</p>
            ${imageHtml}
            <div class="options">
                ${question.options.map((option, index) => `
                    <button class="option-btn" onclick="checkAnswer(${index})">
                        ${option}
                    </button>
                `).join('')}
            </div>
            <div id="result"></div>
            <button id="nextBtn" class="next-btn" style="display:none;" onclick="nextQuestion()">Далі</button>
        </div>
    `;
}

function checkAnswer(selectedIndex) {
    if (answered) return;

    answered = true;
    const question = currentQuestions[currentQuestionIndex];
    const buttons = document.querySelectorAll('.option-btn');
    const result = document.getElementById('result');
    const nextBtn = document.getElementById('nextBtn');

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
}

function nextQuestion() {
    currentQuestionIndex++;

    if (currentQuestionIndex < currentQuestions.length) {
        showQuestion();
    } else {
        showResult();
    }
}

function showResult() {
    const trainingSection = document.querySelector('#training');
    trainingSection.innerHTML = `
        <h2>Тема: ${currentTopic}</h2>
        <div class="panel">
            <p>Тест завершено.</p>
            <p>Ваш результат: ${score} з ${currentQuestions.length}</p>
            <button class="next-btn" onclick="location.href='#topics'">Повернутися до тем</button>
        </div>
    `;
}

function openTraining() {
    alert("Оберіть тему на сторінці 'Теми'.");
}

loadQuestions();
