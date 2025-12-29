// Получение элементов
const createRoomForm = document.getElementById("create-room-form");
const roomNameInput = document.getElementById("room-name");
const maxPointsInput = document.getElementById("max-points");
const roomsList = document.getElementById("rooms");
const roomDetailsSection = document.getElementById("room-details");
const roomTitle = document.getElementById("room-title");
const roomMaxPoints = document.getElementById("room-max-points");
const roomPlayersList = document.getElementById("room-players-list");
const addPlayerToRoomBtn = document.getElementById("add-player-to-room-btn");
const modalAddPlayer = document.getElementById("modal-add-player");
const playerNameInput = document.getElementById("player-name");
const addPlayerConfirm = document.getElementById("add-player-confirm");
const modalAddPoints = document.getElementById("modal-add-points");
const playerPointsInput = document.getElementById("player-points");
const addPointsConfirm = document.getElementById("add-points-confirm");
const resetScoresBtn = document.getElementById("reset-scores-btn");
const modalResetScores = document.getElementById("modal-reset-scores");
const resetScoresConfirm = document.getElementById("reset-scores-confirm");
const resetScoresCancel = document.getElementById("reset-scores-cancel");
const modalDeletePlayer = document.getElementById("modal-delete-player");
const deletePlayerConfirm = document.getElementById("delete-player-confirm");
const deletePlayerCancel = document.getElementById("delete-player-cancel");
const modalEndGame = document.getElementById("modal-end-game");
const endGameMessage = document.getElementById("end-game-message");
const restartGameBtn = document.getElementById("restart-game-btn");
const modalDeleteRoom = document.getElementById("modal-delete-room");
const deleteRoomConfirm = document.getElementById("delete-room-confirm");
const deleteRoomCancel = document.getElementById("delete-room-cancel");
const navButtons = document.querySelectorAll(".nav-btn");
const pages = document.querySelectorAll(".page");
const themeButtons = document.querySelectorAll(".theme-btn");
const clearCacheModal = document.getElementById("clear-cache-modal");
const confirmClearCache = document.getElementById("confirm-clear-cache");
const cancelClearCache = document.getElementById("cancel-clear-cache");

const hintContainer = document.getElementById("hint-container");
function showHint(message) {
  hintContainer.textContent = message;
  hintContainer.style.display = "block";
  setTimeout(() => {
    hintContainer.style.display = "none";
  }, 3000);
}

// Данные
let rooms = JSON.parse(localStorage.getItem("rooms")) || [];
let recentPlayers = JSON.parse(localStorage.getItem("recentPlayers")) || []; // Для хранения последних имён
let currentRoomIndex = null;
let currentPlayerIndex = null;

// Сохранение данных
function saveToLocalStorage() {
  localStorage.setItem("rooms", JSON.stringify(rooms));
  localStorage.setItem("recentPlayers", JSON.stringify(recentPlayers));
}

// Навигация между страницами
document.addEventListener("DOMContentLoaded", () => {
  const activeSection = document.querySelector(".page.active");
  const activeButton = document.querySelector(`.nav-btn[data-target="${activeSection.id}"]`);
  if (activeButton) activeButton.classList.add("active");
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    const target = button.getAttribute("data-target");
    pages.forEach((page) => page.classList.remove("active"));
    document.getElementById(target).classList.add("active");
  });
});

// Проверка имени при загрузке
document.addEventListener("DOMContentLoaded", () => {
  const playerName = localStorage.getItem("playerName");
  if (!playerName) showNameModal();
});

function showNameModal() {
  const modal = document.getElementById("modal-player-name");
  modal.classList.add("show");
  const confirmButton = document.getElementById("confirm-name");
  confirmButton.addEventListener("click", () => {
    const inputName = document.getElementById("player-name-input").value.trim();
    if (inputName) {
      localStorage.setItem("playerName", inputName);
      modal.classList.remove("show");
    }
  });
}

// Логика аватарки
function getRandomAvatar() {
  const avatarCount = 128;
  const avatarNumber = Math.floor(Math.random() * avatarCount) + 1;
  return `assets/ava/ava${avatarNumber.toString().padStart(2, '0')}.png`;
}

// Отображение списка комнат (с индикатором режима)
function renderRooms() {
  roomsList.innerHTML = rooms
    .map(
      (room, index) => `
      <li onclick="openRoom(${index})">
        <div class="room-info">
          <div class="room-title">
            <h3>${room.name}</h3>
            <span class="mode-tag ${room.mode === 'lose' ? 'mode-lose' : 'mode-reset'}">
              ${room.mode === 'reset' ? '#Обнуление' : '#Проигрыш'}
            </span>
          </div>
          <p>Макс. очков: ${room.maxPoints}</p>
        </div>
        <button onclick="event.stopPropagation(); openDeleteRoomModal(${index})">
          <span class="material-icons">delete</span>
        </button>
      </li>
    `
    )
    .join("");

  const noRoomsPlaceholder = document.getElementById("no-rooms-placeholder");
  if (rooms.length === 0) {
    noRoomsPlaceholder.style.display = "block";
  } else {
    noRoomsPlaceholder.style.display = "none";
  }
}

// Дополнительный функционал: поиск комнат (простой фильтр)
document.addEventListener("DOMContentLoaded", () => {
  const roomListSection = document.getElementById("room-list");
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Поиск по названию комнаты...";
  searchInput.classList.add("search-input");
  roomListSection.insertBefore(searchInput, roomsList);

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const filteredRooms = rooms.filter(room => room.name.toLowerCase().includes(query));
    roomsList.innerHTML = filteredRooms
    .map(
      (room, index) => `
      <li onclick="openRoom(${index})">
        <div class="room-info">
          <div class="room-title">
            <h3>${room.name}</h3>
            <span class="mode-tag ${room.mode === 'lose' ? 'mode-lose' : 'mode-reset'}">
              ${room.mode === 'reset' ? '#Обнуление' : '#Проигрыш'}
            </span>
          </div>
          <p>Макс. очков: ${room.maxPoints}</p>
        </div>
        <button onclick="event.stopPropagation(); openDeleteRoomModal(${index})">
          <span class="material-icons">delete</span>
        </button>
      </li>
    `
    )
    .join("");
  });
});

// Создание комнаты
createRoomForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = roomNameInput.value.trim();
  const maxPoints = parseInt(maxPointsInput.value.trim(), 10);
  const mode = document.querySelector('input[name="room-mode"]:checked').value;
  if (roomName && maxPoints > 0) {
    const newRoom = {
      name: roomName,
      maxPoints: maxPoints,
      mode: mode, // Новый параметр
      players: [],
      createdAt: new Date().toISOString()
    };
    rooms.push(newRoom);
    saveToLocalStorage();
    renderRooms();
    roomNameInput.value = "";
    maxPointsInput.value = "";
    document.querySelector(".page.active").classList.remove("active");
    document.getElementById("room-list").classList.add("active");
    navButtons.forEach((btn) => btn.classList.remove("active"));
    document.querySelector(`.nav-btn[data-target="room-list"]`).classList.add("active");
  } else {
    showHint("Введите корректные данные.");
  }
});

// Открытие комнаты
function openRoom(index) {
  currentRoomIndex = index;
  const room = rooms[index];
  roomTitle.textContent = room.name;
  roomMaxPoints.textContent = room.maxPoints;
  const modeIndicator = document.getElementById("room-mode-indicator");
  modeIndicator.textContent = room.mode === 'reset' ? '#Обнуление' : '#Проигрыш';
  modeIndicator.classList.toggle('mode-lose', room.mode === 'lose');
  renderRoomPlayers();
  document.querySelector(".page.active").classList.remove("active");
  roomDetailsSection.classList.add("active");
}

let isSortingEnabled = true;
const sortToggle = document.getElementById("sort-toggle");
sortToggle.addEventListener("change", (event) => {
  isSortingEnabled = event.target.checked;
  renderRoomPlayers();
});

// Отображение игроков в комнате
// Отображение игроков в комнате
function renderRoomPlayers() {
  if (currentRoomIndex === null) return;

  const room = rooms[currentRoomIndex];
  let players = [...room.players];
  if (isSortingEnabled) {
    players.sort((a, b) => b.score - a.score);
  }

  const playersList = document.getElementById("room-players-list");
  const noPlayersPlaceholder = document.getElementById("no-players-placeholder");

  if (players.length === 0) {
    playersList.innerHTML = "";
    noPlayersPlaceholder.style.display = "block";
  } else {
    noPlayersPlaceholder.style.display = "none";
    playersList.innerHTML = players
      .map(
        (player) => `
        <div class="card" onclick="openAddPointsModal('${player.id}')">
          <div class="card-info">
            <img src="${player.avatar}" alt="Avatar" style="width: 55px; height: 55px; border-radius: 50%; margin-right: 10px;">
            <div class="player-score">
              <h3>${player.name}</h3>
              <p>Очки: <strong>${player.score}</strong></p>
            </div>  
          </div>
          <div class="controls" onclick="event.stopPropagation()">
            <button onclick="openDeletePlayerModal('${player.id}')" class="delete-btn">
              <span class="material-icons">delete</span>
            </button>
            <button onclick="openAddPointsModal('${player.id}')" class="add-btn">
              <span class="material-icons">add</span>
            </button>
          </div>
        </div>
      `
      )
      .join("");
  }
}

// Добавление игрока
addPlayerToRoomBtn.addEventListener("click", () => {
  openModal(modalAddPlayer, playerNameInput);
});

// Добавление игрока (обновление recentPlayers)
addPlayerConfirm.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim();
  if (playerName && currentRoomIndex !== null) {
    const room = rooms[currentRoomIndex];
    const newPlayer = {
      id: Date.now().toString(),
      name: playerName,
      score: 0,
      avatar: getRandomAvatar(),
      history: [] // Для истории очков
    };
    room.players.push(newPlayer);
    // Обновляем recentPlayers (последние 10 уникальных)
    recentPlayers = [...new Set([playerName, ...recentPlayers])].slice(0, 10);
    saveToLocalStorage();
    renderRoomPlayers();
    modalAddPlayer.style.display = "none";
    playerNameInput.value = "";
  } else {
    showHint("Введите имя игрока.");
  }
});

// Отображение чипсов с недавними именами в модалке
function renderRecentPlayersChips() {
  const chipsContainer = document.getElementById("recent-players-chips");
  chipsContainer.innerHTML = recentPlayers
    .map(name => `<span class="chip" onclick="selectRecentPlayer('${name}')">${name}</span>`)
    .join("");
}

// Выбор чипса
function selectRecentPlayer(name) {
  playerNameInput.value = name;
}

// Вызов renderRecentPlayersChips при открытии модалки
addPlayerToRoomBtn.addEventListener("click", () => {
  renderRecentPlayersChips();
  openModal(modalAddPlayer, playerNameInput);
});

// Открытие модального окна для добавления очков
function openAddPointsModal(playerId) {
  // Находим игрока для отображения инфы
  const room = rooms[currentRoomIndex];
  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    showHint("Игрок не найден.");
    return;
  }

  // Заполняем заголовок модалки
  document.getElementById("player-info").innerHTML = `
    <img src="${player.avatar}" alt="Avatar" style="width: 50px; height: 50px; border-radius: 50%;">
    <strong>${player.name}</strong>
  `;

  // Очищаем поле ввода
  playerPointsInput.value = "";

  // Показываем историю очков игрока
  const historyList = document.getElementById("player-history-list");
  if (player.history && player.history.length > 0) {
    historyList.innerHTML = player.history
      .slice(-10) // Показываем последние 10 действий
      .reverse()
      .map(points => `<li>${points > 0 ? '+' : ''}${points}</li>`)
      .join("");
  } else {
    historyList.innerHTML = "<li>История пуста</li>";
  }

  modalAddPoints.style.display = "flex";

  // === КЛЮЧЕВАЯ ЧАСТЬ: обработчики с замыканием ===
  const confirmHandler = () => {
    const pointsInput = playerPointsInput.value.trim();
    const points = parseInt(pointsInput, 10);

    if (isNaN(points) || pointsInput === "") {
      showHint("Введите корректное число очков.");
      return;
    }

    // Находим игрока заново (на случай изменений)
    const updatedPlayer = room.players.find(p => p.id === playerId);
    if (!updatedPlayer) {
      showHint("Игрок не найден.");
      modalAddPoints.style.display = "none";
      return;
    }

    // Добавляем очки
    updatedPlayer.score += points;

    // Сохраняем в историю
    if (!updatedPlayer.history) updatedPlayer.history = [];
    updatedPlayer.history.push(points);

    saveToLocalStorage();
    renderRoomPlayers();
    checkGameEnd(); // Проверяем окончание игры (обнуление или проигрыш)

    modalAddPoints.style.display = "none";
    showHint(`Добавлено ${points > 0 ? '+' : ''}${points} очков игроку ${updatedPlayer.name}`);

    // Удаляем обработчики
    addPointsConfirm.removeEventListener("click", confirmHandler);
    document.getElementById("modal-cancel").removeEventListener("click", cancelHandler);
  };

  const cancelHandler = () => {
    modalAddPoints.style.display = "none";
    addPointsConfirm.removeEventListener("click", confirmHandler);
    document.getElementById("modal-cancel").removeEventListener("click", cancelHandler);
  };

  // Назначаем обработчики
  addPointsConfirm.addEventListener("click", confirmHandler);
  document.getElementById("modal-cancel").addEventListener("click", cancelHandler); // Кнопка "Отмена" в модалке очков
}

function renderPlayerHistory(playerIndex) {
  const room = rooms[currentRoomIndex];
  const player = room.players[playerIndex];
  const historyList = document.getElementById("player-history-list");
  if (player.history && player.history.length > 0) {
    historyList.innerHTML = player.history
      .map((entry) => `<li>Добавлено: <strong>${entry}</strong> очков</li>`)
      .join("");
  } else {
    historyList.innerHTML = "<li>История отсутствует</li>";
  }
}

// Добавление очков (с вызовом checkGameEnd)
addPointsConfirm.addEventListener("click", () => {
  const points = parseInt(playerPointsInput.value.trim(), 10);
  if (!isNaN(points) && currentPlayerIndex !== null && currentRoomIndex !== null) {
    const player = rooms[currentRoomIndex].players.find(p => p.id === currentPlayerIndex);
    if (player) {
      player.score += points;
      player.history.push(points);
      saveToLocalStorage();
      renderRoomPlayers();
      checkGameEnd(); // Проверяем после добавления
      modalAddPoints.style.display = "none";
      playerPointsInput.value = "";
    }
  } else {
    showHint("Введите корректное количество очков.");
  }
});

// Сброс очков игроков
resetScoresBtn.addEventListener("click", () => {
  openModal(modalResetScores);
});

resetScoresConfirm.addEventListener("click", () => {
  const room = rooms[currentRoomIndex];
  room.players = room.players.map((player) => ({
    ...player,
    score: 0,
    history: []
  }));
  saveToLocalStorage();
  renderRoomPlayers();
  closeModal(modalResetScores);
});

// Удаляем глобальную currentPlayerIndex или оставляем только для добавления очков

function openDeletePlayerModal(playerId) {
  modalDeletePlayer.style.display = "flex";

  // Временная функция подтверждения
  const confirmHandler = () => {
    if (currentRoomIndex !== null) {
      const room = rooms[currentRoomIndex];
      const index = room.players.findIndex(p => p.id === playerId);
      if (index !== -1) {
        room.players.splice(index, 1);
        saveToLocalStorage();
        renderRoomPlayers();
        showHint("Игрок успешно удалён");
      } else {
        showHint("Игрок не найден");
      }
    }
    modalDeletePlayer.style.display = "none";
    // Удаляем обработчики
    deletePlayerConfirm.removeEventListener("click", confirmHandler);
    deletePlayerCancel.removeEventListener("click", cancelHandler);
  };

  const cancelHandler = () => {
    modalDeletePlayer.style.display = "none";
    deletePlayerConfirm.removeEventListener("click", confirmHandler);
    deletePlayerCancel.removeEventListener("click", cancelHandler);
  };

  deletePlayerConfirm.addEventListener("click", confirmHandler);
  deletePlayerCancel.addEventListener("click", cancelHandler);
}

deletePlayerConfirm.addEventListener("click", () => {
  const room = rooms[currentRoomIndex];
  if (room && currentPlayerIndex !== null) {
    room.players.splice(currentPlayerIndex, 1);
    saveToLocalStorage();
    renderRoomPlayers();
    modalDeletePlayer.style.display = "none";
  } else {
    showHint("Ошибка при удалении игрока!");
  }
});

deletePlayerCancel.addEventListener("click", () => {
  modalDeletePlayer.style.display = "none";
});

// Функция миграции данных
function migrateData() {
  let rooms = JSON.parse(localStorage.getItem("rooms")) || [];
  rooms.forEach(room => {
    room.players.forEach(player => {
      if (!player.id) player.id = Date.now() + Math.floor(Math.random() * 1000);
      if (!player.history) player.history = [];
      if (!player.avatar) player.avatar = getRandomAvatar();
    });
  });
  localStorage.setItem("rooms", JSON.stringify(rooms));
}

document.addEventListener("DOMContentLoaded", () => {
  migrateData();
});

let gameHistory = JSON.parse(localStorage.getItem("gameHistory")) || [];
let globalGameNumber = JSON.parse(localStorage.getItem("globalGameNumber")) || 0;

function saveGameHistory() {
  const room = rooms[currentRoomIndex];
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  globalGameNumber += 1;
  const historyEntry = {
    globalGameNumber,
    roomName: room.name,
    endedAt: new Date().toISOString(), // Добавляем дату и время завершения
    players: sortedPlayers.map((player, index, array) => ({
      name: player.name,
      score: player.score,
      emoji: index === 0 ? "💀" : index === array.length - 1 ? "🏆" : index === array.length - 2 ? "🥶" : "🎯",
    })),
  };
  gameHistory.push(historyEntry);
  localStorage.setItem("gameHistory", JSON.stringify(gameHistory));
  localStorage.setItem("globalGameNumber", JSON.stringify(globalGameNumber));
}

function renderGameHistory() {
  const historyContainer = document.getElementById("history-container");
  if (!gameHistory || gameHistory.length === 0) {
    historyContainer.innerHTML = "<p>История игр отсутствует.</p>";
    return;
  }
  const sortedHistory = gameHistory.sort((a, b) => b.globalGameNumber - a.globalGameNumber);
  historyContainer.innerHTML = sortedHistory
    .map(
      (entry) => `
      <div class="history-card">
        <h2>#${entry.globalGameNumber} ${entry.roomName}</h2>
        <p>Завершена: ${new Date(entry.endedAt).toLocaleString()}</p>
        <ul>
          ${entry.players.map((player) => `<li>${player.emoji} <strong>${player.name}</strong> — ${player.score} очков</li>`).join("")}
        </ul>
      </div>
    `
    )
    .join("");
}

document.getElementById("history-btn").addEventListener("click", () => {
  document.getElementById("history-page").classList.add("active");
  renderGameHistory();
});
// Кнопка "Добавить первого игрока" в пустой комнате
document.getElementById("add-first-player-btn")?.addEventListener("click", () => {
  openModal(modalAddPlayer, playerNameInput);
});


// Удаление комнаты
function openDeleteRoomModal(index) {
  currentRoomIndex = index;
  modalDeleteRoom.style.display = "flex";
}

deleteRoomConfirm.addEventListener("click", () => {
  rooms.splice(currentRoomIndex, 1);
  saveToLocalStorage();
  renderRooms();
  modalDeleteRoom.style.display = "none";
  document.querySelector(".page.active").classList.remove("active");
  document.getElementById("room-list").classList.add("active");
});

deleteRoomCancel.addEventListener("click", () => {
  modalDeleteRoom.style.display = "none";
});

// Открытие и закрытие модальных окон
function openModal(modal, inputField = null) {
  modal.style.display = "flex";
  if (inputField) setTimeout(() => inputField.focus(), 50);
}

function closeModal(modal) {
  modal.style.display = "none";
}

// Проверка ввода
function validateInput(input) {
  const maxLength = 15;
  const regex = /^[\p{L}\p{N}\s\p{Emoji_Presentation}-]*$/u;
  if (input.value.length > maxLength) {
    input.value = input.value.substring(0, maxLength);
    showHint(`Максимум ${maxLength} символов.`);
    input.style.border = "2px solid red";
    return;
  }
  if (!regex.test(input.value)) {
    input.value = input.value.replace(/[^\p{L}\p{N}\s\p{Emoji_Presentation}-]/gu, "");
    showHint("Спецсимволы запрещены, кроме эмодзи и дефиса.");
    input.style.border = "2px solid red";
  } else {
    input.style.border = "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
  inputs.forEach((input) => {
    input.addEventListener("input", () => validateInput(input));
    input.addEventListener("blur", () => validateInput(input));
  });
});
// Делаем радиобаттоны красивыми при клике
document.querySelectorAll('.mode-radio').forEach(label => {
  label.addEventListener('click', () => {
    document.querySelectorAll('.mode-radio').forEach(l => l.classList.remove('active'));
    label.classList.add('active');
  });
});

// Смена темы
function initializeTheme() {
  const savedTheme = localStorage.getItem("theme") || "default";
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.className = theme;
  localStorage.setItem("theme", theme);
}

document.getElementById("theme-selector").addEventListener("change", (event) => {
  applyTheme(event.target.value);
});

initializeTheme();

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedTheme = button.dataset.theme;
    applyTheme(selectedTheme);
});
});

// Кастомный селектор тем
const customSelect = document.querySelector(".custom-select");
const customSelectTrigger = customSelect.querySelector(".custom-select-trigger");
const customOptions = customSelect.querySelector(".custom-options");
const hiddenSelect = document.getElementById("theme-selector");
const options = customOptions.querySelectorAll(".custom-option");

function setActiveOption(value) {
  options.forEach((opt) => opt.classList.remove("active"));
  const matchedOption = [...options].find((opt) => opt.getAttribute("data-value") === value);
  if (matchedOption) {
    matchedOption.classList.add("active");
    customSelectTrigger.querySelector("span").textContent = matchedOption.textContent;
    hiddenSelect.value = value;
  }
}

customSelectTrigger.addEventListener("click", () => {
  customSelect.classList.toggle("open");
  if (customSelect.classList.contains("open")) setActiveOption(hiddenSelect.value);
});

document.addEventListener("click", (e) => {
  if (!customSelect.contains(e.target)) customSelect.classList.remove("open");
});

options.forEach((option) => {
  option.addEventListener("click", () => {
    const newValue = option.getAttribute("data-value");
    setActiveOption(newValue);
    customSelect.classList.remove("open");
    applyTheme(newValue);
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "default";
  applyTheme(savedTheme);
  const themeSelector = document.getElementById("theme-selector");
  if (themeSelector) themeSelector.value = savedTheme;
});

// Закрытие модальных окон
resetScoresCancel.addEventListener("click", () => closeModal(modalResetScores));
deletePlayerCancel.addEventListener("click", () => closeModal(modalDeletePlayer));
deleteRoomCancel.addEventListener("click", () => closeModal(modalDeleteRoom));
document.querySelectorAll("#modal-cancel").forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(modalAddPlayer);
    closeModal(modalAddPoints);
  });
});

// Автопрокрутка карусели с кликабельными элементами
const carousel = document.querySelector('.carousel');
let scrollAmount = 0;
setInterval(() => {
  scrollAmount += carousel.offsetWidth - 33;
  if (scrollAmount >= carousel.scrollWidth) scrollAmount = 0;
  carousel.scrollTo({ left: scrollAmount, behavior: 'smooth' });
}, 7000);

const carousel1 = document.querySelector('.carousel1');
let scrollAmount1 = 0;
setInterval(() => {
  scrollAmount1 += carousel1.offsetWidth - 33;
  if (scrollAmount1 >= carousel1.scrollWidth) scrollAmount1 = 0;
  carousel1.scrollTo({ left: scrollAmount1, behavior: 'smooth' });
}, 7000);

// Добавление кликабельности для элементов карусели
const slides = document.querySelectorAll('.carousel-item');
slides.forEach(slide => {
  const url = slide.dataset.link;
  if (url) {
    slide.style.cursor = "pointer";
    slide.addEventListener("click", () => window.open(url, "_blank"));
  }
});

// Инициализация приложения
renderRooms();
renderRecentPlayersChips();

function showEndGameModal(loser, winners) {
  const modal = document.getElementById("modal-end-game");
  const loserAvatar = document.getElementById("loser-avatar");
  const loserName = document.getElementById("loser-name");
  const loserScore = document.getElementById("loser-score");
  const winnersList = document.getElementById("winners");

  loserAvatar.src = loser.avatar;
  loserName.textContent = loser.name;
  loserScore.textContent = loser.score;

  winnersList.innerHTML = winners
    .map(player => `
      <li>
        <img src="${player.avatar}" alt="Avatar" style="width: 30px; height: 30px; border-radius: 50%;">
        ${player.name} — ${player.score} очков
      </li>
    `)
    .join("");

  modal.style.display = "flex";
}

restartGameBtn.addEventListener("click", () => {
  const room = rooms[currentRoomIndex];
  saveGameHistory();
  room.players = room.players.map((player) => ({ ...player, score: 0 }));
  saveToLocalStorage();
  renderRoomPlayers();
  modalEndGame.style.display = "none";
});

// Проверка окончания игры (учитывая режим)
function checkGameEnd() {
  if (currentRoomIndex === null) return;
  const room = rooms[currentRoomIndex];
  const max = room.maxPoints;

  let gameEnded = false;

  for (let player of room.players) {
    if (player.score > max) {
      // Любой перебор (> max) — немедленный проигрыш, независимо от режима
      const winners = room.players.filter(p => p.id !== player.id);
      showEndGameModal(player, winners);
      gameEnded = true;
      break; // Выходим, игра закончилась
    } else if (player.score === max) {
      if (room.mode === 'lose') {
        // Режим "Проигрыш": ровно max — проигрыш
        const winners = room.players.filter(p => p.id !== player.id);
        showEndGameModal(player, winners);
        gameEnded = true;
        break;
      } else {
        // Режим "Обнуление": ровно max — обнуляем
        player.score = 0;
        if (!player.history) player.history = [];
        player.history.push(-max); // Записываем обнуление как -max
        showHint(`${player.name} набрал ровно ${max} очков — счёт обнулён! 🔄`);
      }
    }
  }

  if (gameEnded) return; // Не обновляем интерфейс, если игра закончилась (модалка уже показана)

  saveToLocalStorage();
  renderRoomPlayers();
}



const funnyTexts = [
  "Шарю по карманам в поисках очков...",
  "Раздаю карты... не глядя, конечно",
  "Считаю, кто сегодня проиграет...",
  "Грею стул для главного лузера",
  "Подкручиваю рандом в твою пользу (шутка)",
  "Игроки загружаются... медленно, как всегда",
  "Готовлю попкорн для драмы",
  "Расставляю мины на поле очков",
  "Кто-то уже жалеет, что пришёл",
  "Загружаю эпичный фейл...",
  "Мешаю колоду... пальцем",
  "Проверяю, все ли готовы плакать",
  "Собираю команду мечты... лузеров",
  "Тестирую удачу на прочность",
  "Ждём, пока все прочитают правила (никто не читает)",
  "Разогреваю атмосферу трэша",
  "Генерирую случайный победитель... ой, проигравший",
  "Поджигаю фитиль веселья",
  "Калибрую уровень скилла (на ноль)",
  "Загружаю мемы для проигравших"
];

// Рандомный текст при загрузке
const loadingText = document.getElementById("loading-text");
if (loadingText) {
  const randomText = funnyTexts[Math.floor(Math.random() * funnyTexts.length)];
  loadingText.textContent = randomText;
}

// Скрываем лоадер после полной загрузки страницы
window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");
      setTimeout(() => {
        loader.style.display = "none"; // Полностью убираем из DOM
      }, 600);
    }, 800); // Небольшая задержка для красоты
  }
});

function navigateTo(pageId) {
  document.querySelector(".page.active").classList.remove("active");
  document.getElementById(pageId).classList.add("active");
}

// Очистка кэша с принудительной перезагрузкой
document.getElementById("clear-cache-btn").addEventListener("click", () => {
  clearCacheModal.style.display = "block";
});

cancelClearCache.addEventListener("click", () => {
  clearCacheModal.style.display = "none";
});

confirmClearCache.addEventListener("click", () => {
  localStorage.clear();
  sessionStorage.clear();
  caches.keys().then((names) => {
    for (let name of names) caches.delete(name);
  });
  showHint("Кэш успешно очищен. Перезагрузка...");
  setTimeout(() => {
    window.location.reload();
  }, 2000);
  clearCacheModal.style.display = "none";
});

window.addEventListener('resize', () => {
  const inputField = document.activeElement;
  if (inputField.tagName === 'INPUT' || inputField.tagName === 'TEXTAREA') {
    inputField.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

function isNewYearPeriod() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return (month === 12 && day >= 15) || (month === 1 && day <= 20);
}

function createSnow() {
    if (!isNewYearPeriod()) return;

    const container = document.getElementById('snow-overlay');
    if (!container) return;

    // Создаем canvas вместо множества span
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const symbols = ['❄', '❅', '❆', '•'];
    const particles = [];
    const particleCount = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 30 : 60; // Меньше частиц на iOS для оптимизации

    // Создание частиц
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height, // Стартуем выше экрана
            symbol: symbols[Math.floor(Math.random() * symbols.length)],
            size: Math.random() * 15 + 10, // Размер от 10 до 25px
            speedY: Math.random() * 2 + 1, // Скорость падения 1-3 px/frame
            amp: Math.random() * 30 + 10, // Амплитуда колебания 10-40px
            freq: Math.random() * 0.02 + 0.01, // Частота колебания
            phase: Math.random() * Math.PI * 2, // Случайная фаза
            rotSpeed: Math.random() * 0.02 - 0.01, // Скорость вращения -0.01 to 0.01 rad/frame
            angle: 0,
            layer: Math.random(), // 0-1 для симуляции глубины (opacity и blur)
        });
    }

    // Функция анимации
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            // Обновление позиции
            p.y += p.speedY;
            p.phase += p.freq;
            p.x += Math.sin(p.phase) * (p.amp / 10); // Синусоидальное колебание
            p.angle += p.rotSpeed;

            // Симуляция глубины: opacity и "blur" через размер/прозрачность
            const opacity = 0.2 + (1 - p.layer) * 0.8; // Ближе - ярче
            const blurSim = p.layer * 3; // Симулируем blur уменьшением размера или opacity

            // Если вышла за экран, респавн сверху
            if (p.y > canvas.height + p.size) {
                p.y = -p.size;
                p.x = Math.random() * canvas.width;
                p.phase = Math.random() * Math.PI * 2;
            }

            // Рисование
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.font = `${p.size * (1 - p.layer * 0.3)}px serif`; // Меньший размер для "дальних"
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillText(p.symbol, -p.size / 2, p.size / 2); // Центрируем
            ctx.restore();
        });

        requestAnimationFrame(animate);
    }

    animate();

    // Обработка ресайза
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

createSnow();

// Логика обновления PWA
let newWorker;
function showUpdateToast() {
  const toast = document.getElementById("update-toast");
  toast.style.display = "block";
  setTimeout(() => {
    if (newWorker) {
      newWorker.postMessage({ action: 'skipWaiting' });
    }
    setTimeout(() => window.location.reload(), 1000); // Перезагрузка после активации
  }, 5000);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js', { scope: '/' }) // если SW лежит в той же папке, что и index.html
    .then(reg => {
      reg.addEventListener('updatefound', () => {
        newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast();
          }
        });
      });
    })
    .catch(err => console.error('SW registration failed:', err));
}