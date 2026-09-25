const loginPage = document.getElementById("loginPage");
const timerPage = document.getElementById("timerPage");

const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");

const settingsButton = document.getElementById("settingsButton");
const logoutButton = document.getElementById("logoutButton");
const themeButton = document.getElementById("themeButton");
const timersGrid = document.getElementById("timersGrid");
const addTimerButton = document.getElementById("addTimerButton");

const settingsModal = document.getElementById("settingsModal");
const modalOverlay = document.getElementById("modalOverlay");
const closeSettingsButton =
    document.getElementById("closeSettingsButton");
const cancelSettingsButton =
    document.getElementById("cancelSettingsButton");

const settingsForm = document.getElementById("settingsForm");

const adminPasswordInput =
    document.getElementById("adminPasswordInput");

const userPasswordInput =
    document.getElementById("userPasswordInput");

const viewerPasswordInput =
    document.getElementById("viewerPasswordInput");

const settingsMessage =
    document.getElementById("settingsMessage");
 

let currentRole = null;
let timers = [];


// Таймеры отложенного сохранения текста.
const textSaveTimers = new Map();

// Уже выполняющиеся запросы сохранения текста.
const textSavePromises = new Map();


// =========================
// API
// =========================

async function api(url, options = {}) {

    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });


    let data = {};


    try {
        data = await response.json();
    } catch {
        // Ответ может быть пустым.
    }


    if (!response.ok) {
        throw new Error(
            data.error || "Ошибка сервера"
        );
    }


    return data;
}


// =========================
// SESSION
// =========================

async function checkSession() {

    try {

        const data =
            await api("/api/session");


        if (data.authenticated) {

            currentRole =
                data.role;

            showTimerPage();

            await loadTimers();

        } else {

            showLoginPage();

        }

    } catch {

        showLoginPage();

    }
}


function showLoginPage() {

    loginPage.classList.remove("hidden");
    timerPage.classList.add("hidden");


    if (settingsButton) {
        settingsButton.classList.add("hidden");
    }


    if (addTimerButton) {
        addTimerButton.classList.remove("hidden");
    }


    currentRole = null;
}


function showTimerPage() {

    loginPage.classList.add("hidden");
    timerPage.classList.remove("hidden");


    // Настройки видит только admin.
    if (currentRole === "admin") {

        settingsButton.classList.remove(
            "hidden"
        );

    } else {

        settingsButton.classList.add(
            "hidden"
        );
    }


    // Кнопка добавления таймера
    // недоступна Viewer.
    if (currentRole === "viewer") {

        addTimerButton.classList.add(
            "hidden"
        );

    } else {

        addTimerButton.classList.remove(
            "hidden"
        );
    }
}


// =========================
// LOGOUT
// =========================

logoutButton.addEventListener(
    "click",
    async () => {

        try {

            // Перед выходом обязательно сохраняем
            // незавершённый ввод.
            await flushAllTextSaves();


            await api(
                "/api/logout",
                {
                    method: "POST"
                }
            );


            closeSettings();

            showLoginPage();


            passwordInput.value = "";
            loginError.textContent = "";


            passwordInput.focus();

        } catch (error) {

            alert(
                error.message ||
                "Не удалось выйти"
            );
        }
    }
);


// =========================
// THEME
// =========================

function updateThemeButton() {

    if (
        document.body.classList.contains(
            "light-theme"
        )
    ) {

        themeButton.textContent =
            "🌙 Тёмная тема";

    } else {

        themeButton.textContent =
            "☀️ Светлая тема";
    }
}


function applySavedTheme() {

    const savedTheme =
        localStorage.getItem("theme");


    if (savedTheme === "light") {

        document.body.classList.add(
            "light-theme"
        );

    } else {

        document.body.classList.remove(
            "light-theme"
        );
    }


    updateThemeButton();
}


themeButton.addEventListener(
    "click",
    () => {

        const isLight =
            document.body.classList.toggle(
                "light-theme"
            );


        localStorage.setItem(
            "theme",
            isLight ? "light" : "dark"
        );


        updateThemeButton();
    }
);


applySavedTheme();


// =========================
// LOGIN
// =========================

loginForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        loginError.textContent = "";


        const password =
            passwordInput.value.trim();


        if (!password) {

            loginError.textContent =
                "Введите пароль";

            return;
        }


        try {

            const data =
                await api(
                    "/api/login",
                    {
                        method: "POST",

                        body: JSON.stringify({
                            password
                        })
                    }
                );


            currentRole =
                data.role;


            passwordInput.value = "";


            showTimerPage();


            await loadTimers();

        } catch (error) {

            loginError.textContent =
                error.message ||
                "Неверный пароль";
        }
    }
);


// =========================
// TIMERS
// =========================

async function loadTimers() {

    try {

        // Очень важно:
        // перед удалением старых карточек ждём,
        // пока текст всех полей будет сохранён.
        await flushAllTextSaves();


        const data =
            await api("/api/timers");


        timers =
            Array.isArray(data)
                ? data
                : (data.timers || []);


        sortTimers();

        renderTimers();

    } catch (error) {

        console.error(error);


        alert(
            "Не удалось загрузить таймеры"
        );
    }
}


// =========================
// SORT
// =========================

function sortTimers() {

    timers.sort((a, b) => {

        return Number(
            a.remaining_seconds || 0
        ) - Number(
            b.remaining_seconds || 0
        );

    });
}


// =========================
// REORDER
// =========================

function reorderTimerCards() {

    const activeElement =
        document.activeElement;


    // Пока пользователь печатает,
    // не двигаем карточки.
    if (
        activeElement &&
        timersGrid.contains(activeElement) &&
        (
            activeElement.tagName === "INPUT" ||
            activeElement.tagName === "TEXTAREA"
        )
    ) {
        return;
    }


    const cards =
        Array.from(
            timersGrid.querySelectorAll(
                ".timer-card"
            )
        );


    const cardMap =
        new Map();


    for (const card of cards) {

        cardMap.set(
            Number(card.dataset.timerId),
            card
        );
    }


    for (const timer of timers) {

        const card =
            cardMap.get(
                Number(timer.id)
            );


        if (card) {

            timersGrid.insertBefore(
                card,
                addTimerButton
            );
        }
    }
}


// =========================
// RENDER
// =========================

function renderTimers() {

    timersGrid.innerHTML = "";


    timers.forEach(timer => {

        const card =
            createTimerCard(timer);


        timersGrid.appendChild(card);

    });


    timersGrid.appendChild(
        addTimerButton
    );


    // После повторного render снова
    // применяем ограничения Viewer.
    if (currentRole === "viewer") {

        addTimerButton.classList.add(
            "hidden"
        );
    }
}


// =========================
// TEXT SAVE
// =========================

function scheduleTextSave(timer) {

    // Viewer не может редактировать текст.
    if (currentRole === "viewer") {
        return;
    }


    const timerId =
        timer.id;


    // Сразу обновляем локальные данные.
    timer.system =
        timer._cardSystemValue ??
        timer.system ??
        "";


    timer.description =
        timer._cardDescriptionValue ??
        timer.description ??
        "";


    const existingTimeout =
        textSaveTimers.get(timerId);


    if (existingTimeout) {

        clearTimeout(
            existingTimeout
        );
    }


    const timeoutId =
        setTimeout(
            async () => {

                textSaveTimers.delete(
                    timerId
                );


                try {

                    await saveTextFields(
                        timerId
                    );

                } catch (error) {

                    console.error(
                        "Ошибка сохранения текста:",
                        error
                    );
                }

            },
            400
        );


    textSaveTimers.set(
        timerId,
        timeoutId
    );
}


async function saveTextFields(timerId) {

    if (currentRole === "viewer") {
        return;
    }


    const timer =
        timers.find(
            item => item.id === timerId
        );


    if (!timer) {
        return;
    }


    let systemValue =
        timer.system || "";


    let descriptionValue =
        timer.description || "";


    const card =
        timersGrid.querySelector(
            `.timer-card[data-timer-id="${timerId}"]`
        );


    if (card) {

        const systemInput =
            card.querySelector(
                ".timer-system"
            );


        const descriptionInput =
            card.querySelector(
                ".timer-description"
            );


        if (systemInput) {

            systemValue =
                systemInput.value;
        }


        if (descriptionInput) {

            descriptionValue =
                descriptionInput.value;
        }
    }


    timer.system =
        systemValue;


    timer.description =
        descriptionValue;


    const savePromise =
        api(
            `/api/timers/${timerId}`,
            {
                method: "PUT",

                body: JSON.stringify({
                    system:
                        systemValue,

                    description:
                        descriptionValue
                })
            }
        )
            .then(() => {

                timer.system =
                    systemValue;

                timer.description =
                    descriptionValue;

            })
            .finally(() => {

                const currentPromise =
                    textSavePromises.get(
                        timerId
                    );


                if (
                    currentPromise ===
                    savePromise
                ) {

                    textSavePromises.delete(
                        timerId
                    );
                }
            });


    textSavePromises.set(
        timerId,
        savePromise
    );


    await savePromise;
}


async function flushTextSave(timerId) {

    if (currentRole === "viewer") {
        return;
    }


    const timeoutId =
        textSaveTimers.get(
            timerId
        );


    if (timeoutId) {

        clearTimeout(
            timeoutId
        );


        textSaveTimers.delete(
            timerId
        );


        try {

            await saveTextFields(
                timerId
            );

        } catch (error) {

            console.error(
                "Ошибка сохранения текста:",
                error
            );
        }
    }


    const pendingPromise =
        textSavePromises.get(
            timerId
        );


    if (pendingPromise) {

        try {

            await pendingPromise;

        } catch (error) {

            console.error(
                "Ошибка сохранения текста:",
                error
            );
        }
    }
}


async function flushAllTextSaves() {

    if (currentRole === "viewer") {
        return;
    }


    const timerIds =
        new Set([
            ...textSaveTimers.keys(),
            ...textSavePromises.keys()
        ]);


    for (const timerId of timerIds) {

        await flushTextSave(
            timerId
        );
    }
}


// =========================
// CREATE TIMER CARD
// =========================

function createTimerCard(timer) {

    const template =
        document.getElementById(
            "timerTemplate"
        );


    const card =
        template.content
            .firstElementChild
            .cloneNode(true);


    card.dataset.timerId =
        String(timer.id);


    // =========================
    // ELEMENTS
    // =========================

    const system =
        card.querySelector(
            ".timer-system"
        );


    const description =
        card.querySelector(
            ".timer-description"
        );


    const display =
        card.querySelector(
            ".timer-display"
        );


    const daysInput =
        card.querySelector(
            ".days-input"
        );


    const hoursInput =
        card.querySelector(
            ".hours-input"
        );


    const minutesInput =
        card.querySelector(
            ".minutes-input"
        );


    const secondsInput =
        card.querySelector(
            ".seconds-input"
        );


    const startButton =
        card.querySelector(
            ".start-button"
        );


    const stopButton =
        card.querySelector(
            ".stop-button"
        );


    const deleteButton =
        card.querySelector(
            ".delete-button"
        );


    // =========================
    // INITIAL VALUES
    // =========================

    system.value =
        timer.system || "";


    description.value =
        timer.description || "";


    daysInput.value =
        timer.days || 0;


    hoursInput.value =
        timer.hours || 0;


    minutesInput.value =
        timer.minutes || 0;


    secondsInput.value =
        timer.seconds || 0;


    let remainingSeconds =
        Number(
            timer.remaining_seconds || 0
        );


    let running =
        Boolean(timer.running);


    // =========================
    // VIEWER MODE
    // =========================

    if (currentRole === "viewer") {

        // Текст можно видеть,
        // но нельзя менять.
        system.readOnly = true;
        description.readOnly = true;


        // Время нельзя менять.
        daysInput.disabled = true;
        hoursInput.disabled = true;
        minutesInput.disabled = true;
        secondsInput.disabled = true;


        // Управление таймером недоступно.
        startButton.disabled = true;
        stopButton.disabled = true;
        deleteButton.disabled = true;
    }


    // =========================
    // DISPLAY
    // =========================

    function updateDisplay() {

        display.textContent =
            formatTime(
                remainingSeconds
            );
    }


    updateDisplay();


    // =========================
    // SYSTEM
    // =========================

    system.addEventListener(
        "input",
        () => {

            if (currentRole === "viewer") {
                return;
            }


            timer.system =
                system.value;


            timer._cardSystemValue =
                system.value;


            scheduleTextSave(timer);
        }
    );


    system.addEventListener(
        "blur",
        async () => {

            if (currentRole === "viewer") {
                return;
            }


            timer.system =
                system.value;


            timer._cardSystemValue =
                system.value;


            try {

                await flushTextSave(
                    timer.id
                );

            } catch (error) {

                console.error(error);
            }
        }
    );


    // =========================
    // АНОМАЛЬКА
    // =========================

    description.addEventListener(
        "input",
        () => {

            if (currentRole === "viewer") {
                return;
            }


            timer.description =
                description.value;


            timer._cardDescriptionValue =
                description.value;


            scheduleTextSave(timer);
        }
    );


    description.addEventListener(
        "blur",
        async () => {

            if (currentRole === "viewer") {
                return;
            }


            timer.description =
                description.value;


            timer._cardDescriptionValue =
                description.value;


            try {

                await flushTextSave(
                    timer.id
                );

            } catch (error) {

                console.error(error);
            }
        }
    );


    // =========================
    // DURATION
    // =========================

    async function saveDuration() {

        if (currentRole === "viewer") {
            return;
        }


        const days =
            normalizeNumber(
                daysInput.value
            );


        const hours =
            normalizeNumber(
                hoursInput.value
            );


        const minutes =
            normalizeNumber(
                minutesInput.value
            );


        const seconds =
            normalizeNumber(
                secondsInput.value
            );


        remainingSeconds =
            days * 86400 +
            hours * 3600 +
            minutes * 60 +
            seconds;


        await updateTimer(
            timer.id,
            {
                days,
                hours,
                minutes,
                seconds,
                remaining_seconds:
                    remainingSeconds
            }
        );


        updateDisplay();

        sortTimers();

        reorderTimerCards();
    }


    daysInput.addEventListener(
        "change",
        saveDuration
    );


    hoursInput.addEventListener(
        "change",
        saveDuration
    );


    minutesInput.addEventListener(
        "change",
        saveDuration
    );


    secondsInput.addEventListener(
        "change",
        saveDuration
    );


    // =========================
    // START
    // =========================

    startButton.addEventListener(
        "click",
        async () => {

            if (currentRole === "viewer") {
                return;
            }


            // Перед действием сохраняем текст.
            await flushTextSave(
                timer.id
            );


            if (remainingSeconds <= 0) {
                await saveDuration();
            }


            if (remainingSeconds <= 0) {
                return;
            }


            try {

                const data =
                    await api(
                        `/api/timers/${timer.id}`,
                        {
                            method: "PUT",

                            body:
                                JSON.stringify({
                                    running: 1,

                                    remaining_seconds:
                                        remainingSeconds
                                })
                        }
                    );


                if (data.timer) {

                    remainingSeconds =
                        Number(
                            data.timer
                                .remaining_seconds
                            ?? remainingSeconds
                        );
                }


                running = true;


                timer.remaining_seconds =
                    remainingSeconds;


                timer.running = 1;


                updateDisplay();

                sortTimers();

                reorderTimerCards();

            } catch (error) {

                alert(error.message);
            }
        }
    );


    // =========================
    // STOP
    // =========================

    stopButton.addEventListener(
        "click",
        async () => {

            if (currentRole === "viewer") {
                return;
            }


            await flushTextSave(
                timer.id
            );


            try {

                const data =
                    await api(
                        `/api/timers/${timer.id}`,
                        {
                            method: "PUT",

                            body:
                                JSON.stringify({
                                    running: 0,

                                    remaining_seconds:
                                        remainingSeconds
                                })
                        }
                    );


                if (data.timer) {

                    remainingSeconds =
                        Number(
                            data.timer
                                .remaining_seconds
                            ?? remainingSeconds
                        );
                }


                running = false;


                timer.remaining_seconds =
                    remainingSeconds;


                timer.running = 0;


                updateDisplay();

                sortTimers();

                reorderTimerCards();

            } catch (error) {

                alert(error.message);
            }
        }
    );


    // =========================
    // DELETE
    // =========================

    deleteButton.addEventListener(
        "click",
        async () => {

            if (currentRole === "viewer") {
                return;
            }


            if (
                !confirm(
                    "Удалить этот таймер?"
                )
            ) {
                return;
            }


            try {

                // Сначала сохраняем текст
                // именно этой карточки.
                await flushTextSave(
                    timer.id
                );


                await api(
                    `/api/timers/${timer.id}`,
                    {
                        method: "DELETE"
                    }
                );


                await loadTimers();

            } catch (error) {

                alert(error.message);
            }
        }
    );


    // =========================
    // LOCAL COUNTDOWN
    // =========================

    const localInterval =
        setInterval(
            async () => {

                if (
                    !document.body
                        .contains(card)
                ) {

                    clearInterval(
                        localInterval
                    );

                    return;
                }


                if (!running) {
                    return;
                }


                if (remainingSeconds > 0) {

                    remainingSeconds--;

                    updateDisplay();


                    const timerData =
                        timers.find(
                            item =>
                                item.id ===
                                timer.id
                        );


                    if (timerData) {

                        timerData
                            .remaining_seconds =
                            remainingSeconds;


                        timerData.running =
                            remainingSeconds > 0
                                ? 1
                                : 0;
                    }


                    sortTimers();

                    reorderTimerCards();


                    // Viewer только смотрит.
                    // Он НЕ должен отправлять PUT
                    // на сервер во время отсчёта.
                    if (
                        currentRole !== "viewer" &&
                        remainingSeconds % 5 === 0
                    ) {

                        try {

                            await api(
                                `/api/timers/${timer.id}`,
                                {
                                    method: "PUT",

                                    body:
                                        JSON.stringify({
                                            running:
                                                remainingSeconds > 0
                                                    ? 1
                                                    : 0,

                                            remaining_seconds:
                                                remainingSeconds
                                        })
                                }
                            );

                        } catch (error) {

                            console.error(
                                error
                            );
                        }
                    }


                } else {

                    running = false;

                    timer.running = 0;

                    timer.remaining_seconds =
                        0;


                    // Viewer не имеет права
                    // менять состояние таймера.
                    if (
                        currentRole !== "viewer"
                    ) {

                        try {

                            await api(
                                `/api/timers/${timer.id}`,
                                {
                                    method: "PUT",

                                    body:
                                        JSON.stringify({
                                            running: 0,

                                            remaining_seconds:
                                                0
                                        })
                                }
                            );

                        } catch (error) {

                            console.error(
                                error
                            );
                        }
                    }
                }

            },
            1000
        );


    return card;
}


// =========================
// ADD TIMER
// =========================

addTimerButton.addEventListener(
    "click",
    async () => {

        if (currentRole === "viewer") {
            return;
        }


        try {

            // Самое важное:
            // сначала сохраняем весь текст,
            // потом создаём новый таймер.
            await flushAllTextSaves();


            await api(
                "/api/timers",
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            system: "",
                            description: "",

                            days: 0,
                            hours: 0,
                            minutes: 0,
                            seconds: 0,

                            remaining_seconds: 0,

                            running: 0
                        })
                }
            );


            await loadTimers();

        } catch (error) {

            alert(error.message);
        }
    }
);


// =========================
// UPDATE TIMER
// =========================

async function updateTimer(
    id,
    changes
) {

    if (currentRole === "viewer") {
        return;
    }


    try {

        await api(
            `/api/timers/${id}`,
            {
                method: "PUT",

                body:
                    JSON.stringify(changes)
            }
        );


        const timer =
            timers.find(
                item => item.id === id
            );


        if (timer) {

            Object.assign(
                timer,
                changes
            );
        }

    } catch (error) {

        console.error(error);

        alert(error.message);
    }
}


// =========================
// SETTINGS
// =========================

settingsButton.addEventListener(
    "click",
    () => {

        if (currentRole !== "admin") {
            return;
        }


        settingsMessage.textContent = "";


        adminPasswordInput.value = "";
        userPasswordInput.value = "";
        viewerPasswordInput.value = "";


        settingsModal.classList.remove(
            "hidden"
        );


        modalOverlay.classList.remove(
            "hidden"
        );
    }
);


function closeSettings() {

    settingsModal.classList.add(
        "hidden"
    );


    modalOverlay.classList.add(
        "hidden"
    );
}


closeSettingsButton.addEventListener(
    "click",
    closeSettings
);


cancelSettingsButton.addEventListener(
    "click",
    closeSettings
);


modalOverlay.addEventListener(
    "click",
    closeSettings
);


settingsForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        if (currentRole !== "admin") {
            return;
        }


        const adminPassword =
            adminPasswordInput.value.trim();


        const userPassword =
            userPasswordInput.value.trim();


        const viewerPassword =
            viewerPasswordInput.value.trim();


        if (
            !adminPassword &&
            !userPassword &&
            !viewerPassword
        ) {

            settingsMessage.textContent =
                "Введите хотя бы один новый пароль";

            return;
        }


        try {

            await api(
                "/api/passwords",
                {
                    method: "PUT",

                    body:
                        JSON.stringify({
                            adminPassword:
                                adminPassword ||
                                undefined,

                            userPassword:
                                userPassword ||
                                undefined,

                            viewerPassword:
                                viewerPassword ||
                                undefined
                        })
                }
            );


            settingsMessage.textContent =
                "Пароли успешно изменены";


            adminPasswordInput.value = "";
            userPasswordInput.value = "";
            viewerPasswordInput.value = "";

        } catch (error) {

            settingsMessage.textContent =
                error.message;
        }
    }
);


// =========================
// HELPERS
// =========================

function normalizeNumber(value) {

    const number =
        Number.parseInt(
            value,
            10
        );


    if (
        !Number.isFinite(number) ||
        number < 0
    ) {
        return 0;
    }


    return number;
}


function formatTime(totalSeconds) {

    totalSeconds =
        Math.max(
            0,
            Number(totalSeconds) || 0
        );


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


    return `${days}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}


function pad(number) {

    return String(number)
        .padStart(2, "0");
}


// =========================
// START
// =========================

checkSession();
