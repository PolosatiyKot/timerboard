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
const closeSettingsButton = document.getElementById("closeSettingsButton");

const settingsForm = document.getElementById("settingsForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const userPasswordInput = document.getElementById("userPasswordInput");
const settingsMessage = document.getElementById("settingsMessage");

let currentRole = null;
let timers = [];
let intervalId = null;


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
        // Ответ может быть пустым
    }

    if (!response.ok) {
        throw new Error(data.error || "Ошибка сервера");
    }

    return data;
}


// =========================
// SESSION
// =========================

async function checkSession() {
    try {
        const data = await api("/api/session");

        if (data.authenticated) {
            currentRole = data.role;
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

    currentRole = null;
}


function showTimerPage() {
    loginPage.classList.add("hidden");
    timerPage.classList.remove("hidden");

    if (currentRole === "admin") {
        settingsButton.classList.remove("hidden");
    } else {
        settingsButton.classList.add("hidden");
    }
}

// =========================
// LOGOUT
// =========================

logoutButton.addEventListener("click", async () => {
    try {
        await api("/api/logout", {
            method: "POST"
        });

        closeSettings();
        showLoginPage();

        passwordInput.value = "";
        loginError.textContent = "";

        passwordInput.focus();

    } catch (error) {
        alert(error.message || "Не удалось выйти");
    }
});

// =========================
// THEME
// =========================

function updateThemeButton() {
    if (document.body.classList.contains("light-theme")) {
        themeButton.textContent = "🌙 Тёмная тема";
    } else {
        themeButton.textContent = "☀️ Светлая тема";
    }
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
    } else {
        document.body.classList.remove("light-theme");
    }

    updateThemeButton();
}

themeButton.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-theme");

    localStorage.setItem(
        "theme",
        isLight ? "light" : "dark"
    );

    updateThemeButton();
});

applySavedTheme();

// =========================
// LOGIN
// =========================

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    loginError.textContent = "";

    const password = passwordInput.value.trim();

    if (!password) {
        loginError.textContent = "Введите пароль";
        return;
    }

    try {
        const data = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({
                password
            })
        });

        currentRole = data.role;

        passwordInput.value = "";

        showTimerPage();
        await loadTimers();

    } catch (error) {
        loginError.textContent = error.message || "Неверный пароль";
    }
});


// =========================
// TIMERS
// =========================

async function loadTimers() {
    try {
        const data = await api("/api/timers");

        timers = Array.isArray(data)
            ? data
            : (data.timers || []);

        timers.sort((a, b) => {
            return Number(a.remaining_seconds || 0)
                - Number(b.remaining_seconds || 0);
        });

        renderTimers();

    } catch (error) {
        console.error(error);
        alert("Не удалось загрузить таймеры");
    }
}

function reorderTimerCards() {
    const activeElement = document.activeElement;

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

    const cardMap = new Map(
        Array.from(timersGrid.querySelectorAll(".timer-card"))
            .map(card => [
                Number(card.dataset.timerId),
                card
            ])
    );
        Array.from(timersGrid.querySelectorAll(".timer-card"))
            .map(card => [
                Number(card.dataset.timerId),
                card
            ])
    );

    for (const timer of timers) {
        const card = cardMap.get(Number(timer.id));

        if (card) {
            timersGrid.insertBefore(card, addTimerButton);
        }
    }
}

function renderTimers() {
    timersGrid.innerHTML = "";

    timers.forEach(timer => {
        const card = createTimerCard(timer);
        timersGrid.appendChild(card);
    });

    timersGrid.appendChild(addTimerButton);
}


function createTimerCard(timer) {
    const template = document.getElementById("timerTemplate");
    const card = template.content.firstElementChild.cloneNode(true);

    card.dataset.timerId = String(timer.id);
    
    const description = card.querySelector(".timer-description");
    const display = card.querySelector(".timer-display");

    const daysInput = card.querySelector(".days-input");
    const hoursInput = card.querySelector(".hours-input");
    const minutesInput = card.querySelector(".minutes-input");
    const secondsInput = card.querySelector(".seconds-input");

    const startButton = card.querySelector(".start-button");
    const stopButton = card.querySelector(".stop-button");
    const deleteButton = card.querySelector(".delete-button");

    description.value = timer.description || "";

    daysInput.value = timer.days || 0;
    hoursInput.value = timer.hours || 0;
    minutesInput.value = timer.minutes || 0;
    secondsInput.value = timer.seconds || 0;

    let remainingSeconds = Number(timer.remaining_seconds || 0);
    let running = Boolean(timer.running);

    function updateDisplay() {
        display.textContent = formatTime(remainingSeconds);
    }

    updateDisplay();

    // Сохраняем описание
    description.addEventListener("change", async () => {
        await updateTimer(timer.id, {
            description: description.value
        });
    });


    // Сохраняем продолжительность
    async function saveDuration() {
        const days = normalizeNumber(daysInput.value);
        const hours = normalizeNumber(hoursInput.value);
        const minutes = normalizeNumber(minutesInput.value);
        const seconds = normalizeNumber(secondsInput.value);

        remainingSeconds =
            days * 86400 +
            hours * 3600 +
            minutes * 60 +
            seconds;

        await updateTimer(timer.id, {
            days,
            hours,
            minutes,
            seconds,
            remaining_seconds: remainingSeconds
        });

        updateDisplay();
    }


    daysInput.addEventListener("change", saveDuration);
    hoursInput.addEventListener("change", saveDuration);
    minutesInput.addEventListener("change", saveDuration);
    secondsInput.addEventListener("change", saveDuration);


    // START
    startButton.addEventListener("click", async () => {
        if (remainingSeconds <= 0) {
            await saveDuration();
        }

        if (remainingSeconds <= 0) {
            return;
        }

        try {
            const data = await api(`/api/timers/${timer.id}`, {
                method: "PUT",
                body: JSON.stringify({
                    running: 1,
                    remaining_seconds: remainingSeconds
                })
            });

            if (data.timer) {
                remainingSeconds = Number(
                    data.timer.remaining_seconds ?? remainingSeconds
                );
            }

            running = true;
            updateDisplay();

        } catch (error) {
            alert(error.message);
        }
    });


    // STOP
    stopButton.addEventListener("click", async () => {
        try {
            const data = await api(`/api/timers/${timer.id}`, {
                method: "PUT",
                body: JSON.stringify({
                    running: 0,
                    remaining_seconds: remainingSeconds
                })
            });

            if (data.timer) {
                remainingSeconds = Number(
                    data.timer.remaining_seconds ?? remainingSeconds
                );
            }

            running = false;
            updateDisplay();

        } catch (error) {
            alert(error.message);
        }
    });


    // DELETE
    deleteButton.addEventListener("click", async () => {
        if (!confirm("Удалить этот таймер?")) {
            return;
        }

        try {
            await api(`/api/timers/${timer.id}`, {
                method: "DELETE"
            });

            await loadTimers();

        } catch (error) {
            alert(error.message);
        }
    });


    // Локальный отсчёт
    const localInterval = setInterval(async () => {
        if (!document.body.contains(card)) {
            clearInterval(localInterval);
            return;
        }

        if (!running) {
            return;
        }

       if (remainingSeconds > 0) {
    remainingSeconds--;
    updateDisplay();

    const timerData = timers.find(item => item.id === timer.id);

    if (timerData) {
        timerData.remaining_seconds = remainingSeconds;
    }

    timers.sort((a, b) => {
        return Number(a.remaining_seconds || 0)
            - Number(b.remaining_seconds || 0);
    });

reorderTimerCards();
           
    // Периодически сохраняем состояние
            if (remainingSeconds % 5 === 0) {
                try {
                    await api(`/api/timers/${timer.id}`, {
                        method: "PUT",
                        body: JSON.stringify({
                            running: remainingSeconds > 0 ? 1 : 0,
                            remaining_seconds: remainingSeconds
                        })
                    });
                } catch (error) {
                    console.error(error);
                }
            }
        } else {
            running = false;

            try {
                await api(`/api/timers/${timer.id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        running: 0,
                        remaining_seconds: 0
                    })
                });
            } catch (error) {
                console.error(error);
            }
        }
    }, 1000);


    return card;
}


// =========================
// ADD TIMER
// =========================

addTimerButton.addEventListener("click", async () => {
    try {
        await api("/api/timers", {
            method: "POST",
            body: JSON.stringify({
                description: "",
                days: 0,
                hours: 0,
                minutes: 0,
                seconds: 0,
                remaining_seconds: 0,
                running: 0
            })
        });

        await loadTimers();

    } catch (error) {
        alert(error.message);
    }
});


// =========================
// UPDATE TIMER
// =========================

async function updateTimer(id, changes) {
    try {
        await api(`/api/timers/${id}`, {
            method: "PUT",
            body: JSON.stringify(changes)
        });

        const timer = timers.find(item => item.id === id);

        if (timer) {
            Object.assign(timer, changes);
        }

    } catch (error) {
        console.error(error);
        alert(error.message);
    }
}


// =========================
// SETTINGS
// =========================

settingsButton.addEventListener("click", () => {
    if (currentRole !== "admin") {
        return;
    }

    settingsMessage.textContent = "";
    adminPasswordInput.value = "";
    userPasswordInput.value = "";

    settingsModal.classList.remove("hidden");
    modalOverlay.classList.remove("hidden");
});


function closeSettings() {
    settingsModal.classList.add("hidden");
    modalOverlay.classList.add("hidden");
}


closeSettingsButton.addEventListener("click", closeSettings);
modalOverlay.addEventListener("click", closeSettings);


settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const adminPassword = adminPasswordInput.value.trim();
    const userPassword = userPasswordInput.value.trim();

    if (!adminPassword && !userPassword) {
        settingsMessage.textContent = "Введите хотя бы один новый пароль";
        return;
    }

    try {
        await api("/api/passwords", {
            method: "PUT",
            body: JSON.stringify({
                adminPassword: adminPassword || undefined,
                userPassword: userPassword || undefined
            })
        });

        settingsMessage.textContent = "Пароли успешно изменены";

        adminPasswordInput.value = "";
        userPasswordInput.value = "";

    } catch (error) {
        settingsMessage.textContent = error.message;
    }
});


// =========================
// HELPERS
// =========================

function normalizeNumber(value) {
    const number = Number.parseInt(value, 10);

    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }

    return number;
}


function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Number(totalSeconds) || 0);

    const days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;

    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${days}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}


function pad(number) {
    return String(number).padStart(2, "0");
}


// =========================
// START
// =========================

checkSession();
