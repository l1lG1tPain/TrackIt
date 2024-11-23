// Получение элементов
const addPlayerBtn = document.getElementById("add-player-btn");
const resetScoresBtn = document.getElementById("reset-scores-btn");
const playersList = document.getElementById("players-list");
const modalAddPlayer = document.getElementById("modal-add-player");
const modalAddPoints = document.getElementById("modal-add-points");
const modalDeletePlayer = document.getElementById("modal-delete-player");
const modalResetScores = document.getElementById("modal-reset-scores");
const playerNameInput = document.getElementById("player-name");
const playerPointsInput = document.getElementById("player-points");
const addPlayerConfirm = document.getElementById("add-player-confirm");
const addPointsConfirm = document.getElementById("add-points-confirm");
const deletePlayerConfirm = document.getElementById("delete-player-confirm");
const resetScoresConfirm = document.getElementById("reset-scores-confirm");
const modalCancel = document.querySelectorAll("#modal-cancel");

// Загрузка игроков из LocalStorage
let players = JSON.parse(localStorage.getItem("players")) || [];
let currentPlayerIndex = null;

// Функция для сохранения данных в LocalStorage
function saveToLocalStorage() {
  localStorage.setItem("players", JSON.stringify(players));
}

// Открытие модального окна с фокусом на поле ввода
function openModal(modal, inputField = null) {
  modal.style.display = "flex";
  if (inputField) {
    setTimeout(() => {
      inputField.focus(); // Устанавливаем фокус на поле ввода
    }, 50); // Небольшая задержка для отображения клавиатуры
  }
}

// Закрытие модального окна
function closeModal(modal) {
  modal.style.display = "none";
}

// Добавление игрока
addPlayerBtn.addEventListener("click", () => {
  openModal(modalAddPlayer, playerNameInput);
});

addPlayerConfirm.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (name) {
    players.push({ name: name.charAt(0).toUpperCase() + name.slice(1), score: 0 });
    saveToLocalStorage();
    renderPlayers();
    playerNameInput.value = "";
    closeModal(modalAddPlayer);
  }
});

// Добавление очков
function addPoints(index) {
  currentPlayerIndex = index;
  openModal(modalAddPoints, playerPointsInput);
}

addPointsConfirm.addEventListener("click", () => {
  const points = parseInt(playerPointsInput.value.trim(), 10);
  if (!isNaN(points)) {
    players[currentPlayerIndex].score += points;
    saveToLocalStorage();
    renderPlayers();
    playerPointsInput.value = "";
    closeModal(modalAddPoints);
  }
});

// Удаление игрока
function deletePlayer(index) {
  currentPlayerIndex = index;
  openModal(modalDeletePlayer);
}

deletePlayerConfirm.addEventListener("click", () => {
  players.splice(currentPlayerIndex, 1);
  saveToLocalStorage();
  renderPlayers();
  closeModal(modalDeletePlayer);
});

// Сброс очков
resetScoresBtn.addEventListener("click", () => {
  openModal(modalResetScores);
});

resetScoresConfirm.addEventListener("click", () => {
  players = players.map((player) => ({ ...player, score: 0 }));
  saveToLocalStorage();
  renderPlayers();
  closeModal(modalResetScores);
});

// Отображение игроков
function renderPlayers() {
  players.sort((a, b) => b.score - a.score);
  playersList.innerHTML = players
    .map(
      (player, index) => `
      <div class="card">
        <h3>${player.name} (Очки: <strong>${player.score}</strong>)</h3>
        <div class="controls">
          <button onclick="deletePlayer(${index})"><span class="material-icons">delete</span></button>
          <button onclick="addPoints(${index})"><span class="material-icons">add</span></button>
        </div>
      </div>
    `
    )
    .join("");
}

// Закрытие всех модальных окон
modalCancel.forEach((btn) => {
  btn.addEventListener("click", () => {
    closeModal(modalAddPlayer);
    closeModal(modalAddPoints);
    closeModal(modalDeletePlayer);
    closeModal(modalResetScores);
  });
});

// Установка PWA
let deferredPrompt; // Для сохранения события
const installPwaModal = document.getElementById("install-pwa");
const installConfirmBtn = document.getElementById("install-confirm");
const installCancelBtn = document.getElementById("install-cancel");

// Слушаем событие beforeinstallprompt
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); // Предотвращаем стандартное окно
  deferredPrompt = event; // Сохраняем событие
  openModal(installPwaModal); // Показываем наше модальное окно
});

// Кнопка "Установить"
installConfirmBtn.addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt(); // Показываем стандартное окно установки
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      console.log("PWA установлено");
    } else {
      console.log("PWA отклонено");
    }
    deferredPrompt = null; // Сбрасываем сохраненное событие
  }
  closeModal(installPwaModal);
});

// Кнопка "Позже"
installCancelBtn.addEventListener("click", () => {
  closeModal(installPwaModal);
});

// Инициализация
renderPlayers();
