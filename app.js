// ======================================================
// TIMER BOARD — ОСНОВНАЯ ЛОГИКА
// ======================================================

// ------------------------------------------------------
// НАСТРОЙКИ
// ------------------------------------------------------

// Временные пароли для первого запуска.
// Позже мы перенесём их на сервер и сделаем нормальную
// безопасную авторизацию.
let passwords = {
    admin: "admin123",
    user: "user123"
};

// Текущая роль пользователя
let currentRole = null;

// Массив таймеров
let timers = [];

// ID следующего таймера
let nextTimerId = 1;


// ------------------------------------------------------
// DOM-ЭЛЕМЕНТЫ
// ------------------------------------------------------

const loginPage = document.getElementById("loginPage");
const timerPage = document.getElementById("timerPage");

const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");

const settingsButton = document.getElementById("settingsButton");

const settingsModal = document.getElementById("settingsModal");
const modalOverlay = document.getElementById("modalOverlay");

const closeSettingsButton =
    document.getElementById("closeSettingsButton");

const cancelSettingsButton =
    document.getElementById("cancelSettingsButton");

const settingsForm =
    document.getElementById("settingsForm");

const adminPasswordInput =
    document.getElementById("adminPasswordInput");

const userPasswordInput =
    document.getElementById("userPasswordInput");

const settingsMessage =
    document.getElementById("settingsMessage");

const timersGrid =
    document.getElementById("timersGrid");

const addTimerButton =
    document.getElementById("addTimerButton");

const timerTemplate =
    document.getElementById("timerTemplate");


// ======================================================
// ВХОД
// ======================================================

loginForm.addEventListener("submit", function (event) {

    event.preventDefault();

    const enteredPassword =
        passwordInput.value.trim();

    loginError.textContent = "";

    if (!enteredPassword) {
        loginError.textContent =
            "Введите пароль.";
        return;
    }


    // Проверяем пароль администратора
    if (enteredPassword === passwords.admin) {

        currentRole = "admin";

        openTimerPage();

        settingsButton.classList.remove("hidden");

        return;
    }


    // Проверяем пароль пользователя
    if (enteredPassword === passwords.user) {

        currentRole = "user";

        openTimerPage();

        settingsButton.classList.add("hidden");

        return;
    }


    // Неверный пароль
    loginError.textContent =
        "Неверный пароль.";

    passwordInput.value = "";
    passwordInput.focus();
});


// ======================================================
// ОТКРЫТИЕ СТРАНИЦЫ ТАЙМЕРОВ
// ======================================================

function openTimerPage() {

    loginPage.classList.add("hidden");

    timerPage.classList.remove("hidden");

    renderTimers();
}


// ======================================================
// ДОБАВЛЕНИЕ ТАЙМЕРА
// ======================================================

addTimerButton.addEventListener("click", function () {

    const timer = createTimer();

    timers.push(timer);

    renderTimers();
});


// ======================================================
// СОЗДАНИЕ ОБЪЕКТА ТАЙМЕРА
// ======================================================

function createTimer() {

    return {

        id: nextTimerId++,

        description: "",

        days: 0,

        hours: 0,

        minutes: 0,

        seconds: 0,

        remainingSeconds: 0,

        running: false,

        interval: null
    };
}


// ======================================================
// ОТОБРАЖЕНИЕ ВСЕХ ТАЙМЕРОВ
// ======================================================

function renderTimers() {

    // Удаляем старые карточки,
    // но оставляем кнопку "+"
    const cards =
        timersGrid.querySelectorAll(".timer-card");

    cards.forEach(function (card) {
        card.remove();
    });


    timers.forEach(function (timer) {

        createTimerCard(timer);

    });
}


// ======================================================
// СОЗДАНИЕ КАРТОЧКИ
// ======================================================

function createTimerCard(timer) {

    const fragment =
        timerTemplate.content.cloneNode(true);

    const card =
        fragment.querySelector(".timer-card");

    const descriptionInput =
        fragment.querySelector(".timer-description");

    const display =
        fragment.querySelector(".timer-display");

    const daysInput =
        fragment.querySelector(".days-input");

    const hoursInput =
        fragment.querySelector(".hours-input");

    const minutesInput =
        fragment.querySelector(".minutes-input");

    const secondsInput =
        fragment.querySelector(".seconds-input");

    const startButton =
        fragment.querySelector(".start-button");

    const stopButton =
        fragment.querySelector(".stop-button");

    const deleteButton =
        fragment.querySelector(".delete-button");


    // ------------------------------------------
    // Заполняем значения
    // ------------------------------------------

    descriptionInput.value =
        timer.description;

    daysInput.value =
        timer.days;

    hoursInput.value =
        timer.hours;

    minutesInput.value =
        timer.minutes;

    secondsInput.value =
        timer.seconds;


    updateTimerDisplay(
        timer,
        display
    );


    // ------------------------------------------
    // Описание
    // ------------------------------------------

    descriptionInput.addEventListener(
        "input",
        function () {

            timer.description =
                descriptionInput.value;

        }
    );


    // ------------------------------------------
    // Изменение времени
    // ------------------------------------------

    function updateTimerSettings() {

        if (timer.running) {
            return;
        }

        timer.days =
            Math.max(
                0,
                parseInt(daysInput.value) || 0
            );

        timer.hours =
            Math.min(
                23,
                Math.max(
                    0,
                    parseInt(hoursInput.value) || 0
                )
            );

        timer.minutes =
            Math.min(
                59,
                Math.max(
                    0,
                    parseInt(minutesInput.value) || 0
                )
            );

        timer.seconds =
            Math.min(
                59,
                Math.max(
                    0,
                    parseInt(secondsInput.value) || 0
                )
            );


        timer.remainingSeconds =
            convertToSeconds(timer);


        updateTimerDisplay(
            timer,
            display
        );
    }


    daysInput.addEventListener(
        "input",
        updateTimerSettings
    );

    hoursInput.addEventListener(
        "input",
        updateTimerSettings
    );

    minutesInput.addEventListener(
        "input",
        updateTimerSettings
    );

    secondsInput.addEventListener(
        "input",
        updateTimerSettings
    );


    // ------------------------------------------
    // СТАРТ
    // ------------------------------------------

    startButton.addEventListener(
        "click",
        function () {

            startTimer(
                timer,
                display
            );

        }
    );


    // ------------------------------------------
    // СТОП
    // ------------------------------------------

    stopButton.addEventListener(
        "click",
        function () {

            stopTimer(
                timer
            );

        }
    );


    // ------------------------------------------
    // УДАЛЕНИЕ
    // ------------------------------------------

    deleteButton.addEventListener(
        "click",
        function () {

            deleteTimer(
                timer.id
            );

        }
    );


    timersGrid.insertBefore(
        card,
        addTimerButton
    );
}


// ======================================================
// ПРЕОБРАЗОВАНИЕ ДЕНЬ/ЧАС/МИН/СЕК → СЕКУНДЫ
// ======================================================

function convertToSeconds(timer) {

    return (
        timer.days * 24 * 60 * 60 +
        timer.hours * 60 * 60 +
        timer.minutes * 60 +
        timer.seconds
    );
}


// ======================================================
// ОБРАТНОЕ ПРЕОБРАЗОВАНИЕ СЕКУНД
// ======================================================

function secondsToTime(totalSeconds) {

    const days =
        Math.floor(
            totalSeconds / 86400
        );

    totalSeconds %= 86400;


    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    totalSeconds %= 3600;


    const minutes =
        Math.floor(
            totalSeconds / 60
        );

    const seconds =
        totalSeconds % 60;


    return {
        days,
        hours,
        minutes,
        seconds
    };
}


// ======================================================
// ФОРМАТИРОВАНИЕ ЧИСЛА
// ======================================================

function pad(number) {

    return String(number)
        .padStart(2, "0");
}


// ======================================================
// ОТОБРАЖЕНИЕ ВРЕМЕНИ
// ======================================================

function updateTimerDisplay(
    timer,
    display
) {

    const time =
        secondsToTime(
            timer.remainingSeconds
        );


    display.textContent =
        `${pad(time.days)}:` +
        `${pad(time.hours)}:` +
        `${pad(time.minutes)}:` +
        `${pad(time.seconds)}`;
}


// ======================================================
// СТАРТ ТАЙМЕРА
// ======================================================

function startTimer(
    timer,
    display
) {

    // Уже работает
    if (timer.running) {
        return;
    }


    // Если таймер ещё ни разу не запускался,
    // берём значение из полей
    if (
        timer.remainingSeconds <= 0
    ) {

        timer.remainingSeconds =
            convertToSeconds(timer);
    }


    // Нечего запускать
    if (
        timer.remainingSeconds <= 0
    ) {

        return;
    }


    timer.running = true;


    timer.interval =
        setInterval(
            function () {

                if (
                    timer.remainingSeconds <= 0
                ) {

                    stopTimer(timer);

                    timer.remainingSeconds = 0;

                    updateTimerDisplay(
                        timer,
                        display
                    );

                    return;
                }


                timer.remainingSeconds--;


                updateTimerDisplay(
                    timer,
                    display
                );

            },
            1000
        );
}


// ======================================================
// СТОП ТАЙМЕРА
// ======================================================

function stopTimer(timer) {

    if (timer.interval !== null) {

        clearInterval(
            timer.interval
        );

        timer.interval = null;
    }


    timer.running = false;
}


// ======================================================
// УДАЛЕНИЕ ТАЙМЕРА
// ======================================================

function deleteTimer(timerId) {

    const timer =
        timers.find(
            function (item) {
                return item.id === timerId;
            }
        );


    if (!timer) {
        return;
    }


    stopTimer(timer);


    timers =
        timers.filter(
            function (item) {
                return item.id !== timerId;
            }
        );


    renderTimers();
}


// ======================================================
// НАСТРОЙКИ
// ======================================================

settingsButton.addEventListener(
    "click",
    function () {

        if (currentRole !== "admin") {
            return;
        }

        openSettings();

    }
);


// ======================================================
// ОТКРЫТЬ НАСТРОЙКИ
// ======================================================

function openSettings() {

    settingsMessage.textContent = "";

    adminPasswordInput.value = "";
    userPasswordInput.value = "";

    settingsModal.classList.remove("hidden");

    adminPasswordInput.focus();
}


// ======================================================
// ЗАКРЫТЬ НАСТРОЙКИ
// ======================================================

function closeSettings() {

    settingsModal.classList.add("hidden");

    settingsMessage.textContent = "";
}


// Крестик
closeSettingsButton.addEventListener(
    "click",
    closeSettings
);


// Отмена
cancelSettingsButton.addEventListener(
    "click",
    closeSettings
);


// Клик по затемнённому фону
modalOverlay.addEventListener(
    "click",
    closeSettings
);


// ======================================================
// СОХРАНЕНИЕ НОВЫХ ПАРОЛЕЙ
// ======================================================

settingsForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();


        if (currentRole !== "admin") {
            return;
        }


        const newAdminPassword =
            adminPasswordInput.value.trim();

        const newUserPassword =
            userPasswordInput.value.trim();


        // Можно менять только один пароль.
        // Пустое поле означает "не менять".
        if (
            newAdminPassword.length === 0 &&
            newUserPassword.length === 0
        ) {

            settingsMessage.textContent =
                "Введите хотя бы один новый пароль.";

            settingsMessage.style.color =
                "#dc2626";

            return;
        }


        // Нельзя сделать одинаковые пароли
        const resultingAdminPassword =
            newAdminPassword ||
            passwords.admin;

        const resultingUserPassword =
            newUserPassword ||
            passwords.user;


        if (
            resultingAdminPassword ===
            resultingUserPassword
        ) {

            settingsMessage.textContent =
                "Пароли администратора и пользователя должны отличаться.";

            settingsMessage.style.color =
                "#dc2626";

            return;
        }


        // Сохраняем
        if (newAdminPassword) {

            passwords.admin =
                newAdminPassword;
        }


        if (newUserPassword) {

            passwords.user =
                newUserPassword;
        }


        settingsMessage.textContent =
            "Пароли успешно изменены.";

        settingsMessage.style.color =
            "#16a34a";


        adminPasswordInput.value = "";
        userPasswordInput.value = "";
    }
);


// ======================================================
// ЗАПУСК
// ======================================================

console.log(
    "Timer Board запущен."
);

console.log(
    "Тестовый пароль администратора: admin123"
);

console.log(
    "Тестовый пароль пользователя: user123"
);
