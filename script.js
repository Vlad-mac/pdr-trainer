async function loadQuestions() {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) {
            throw new Error('Не вдалося завантажити questions.json');
        }

        const questions = await response.json();
        showQuestion(questions[0]);
    } catch (error) {
        console.error('Помилка завантаження питань:', error);
        document.querySelector('.container').innerHTML = `
            <h1>🚗 PDR Trainer</h1>
            <p>Не вдалося завантажити питання. Перевір файл questions.json.</p>
        `;
    }
}

function showQuestion(question) {
    const container = document.querySelector('.container');

    container.innerHTML = `
        <h1>🚗 PDR Trainer</h1>
        <div class="quiz-box">
            <h2>Питання ${question.id}</h2>
            <p class="question-text">${question.question}</p>
            <div class="options">
                ${question.options.map((option, index) => `
                    <button class="option-btn" onclick="checkAnswer(${index}, ${question.correctAnswer})">
                        ${option}
                    </button>
                `).join('')}
            </div>
            <div id="result"></div>
        </div>
    `;
}

function checkAnswer(selectedIndex, correctIndex) {
    const result = document.getElementById('result');

    if (selectedIndex === correctIndex) {
        result.innerHTML = '<p style="color:#4ade80; font-size:20px;">✅ Правильно!</p>';
    } else {
        result.innerHTML = '<p style="color:#f87171; font-size:20px;">❌ Неправильно. Спробуй ще раз.</p>';
    }
}

loadQuestions();
