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
let currentRoomIndex = null;
let currentPlayerIndex = null;

// Сохранение данных
function saveToLocalStorage() {
  localStorage.setItem("rooms", JSON.stringify(rooms));
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

// Отображение списка комнат
function renderRooms() {
  roomsList.innerHTML = rooms
    .map(
      (room, index) => `
      <li onclick="openRoom(${index})">
        <div class="room-info">
          <h3>${room.name}</h3>
          <p>Макс. очков: ${room.maxPoints}</p>
        </div>
        <button onclick="event.stopPropagation(); openDeleteRoomModal(${index})">
          <span class="material-icons">delete</span>
        </button>
      </li>
    `
    )
    .join("");
}

// Создание комнаты
createRoomForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = roomNameInput.value.trim();
  const maxPoints = parseInt(maxPointsInput.value.trim(), 10);
  if (roomName && maxPoints > 0) {
    const newRoom = {
      name: roomName,
      maxPoints: maxPoints,
      players: [],
      createdAt: new Date().toISOString() // Добавляем дату и время создания
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
function renderRoomPlayers() {
  const room = rooms[currentRoomIndex];
  let players = [...room.players];
  if (isSortingEnabled) {
    players.sort((a, b) => b.score - a.score);
  }
  roomPlayersList.innerHTML = players
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

// Добавление игрока
addPlayerToRoomBtn.addEventListener("click", () => {
  openModal(modalAddPlayer, playerNameInput);
});

addPlayerConfirm.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim();
  const room = rooms[currentRoomIndex];
  const isDuplicateName = room.players.some(
    (player) => player.name.toLowerCase() === playerName.toLowerCase()
  );
  if (isDuplicateName) {
    showHint("Игрок с таким именем уже существует в этой комнате.");
    return;
  }
  if (playerName) {
    room.players.push({
      id: Date.now(),
      name: playerName,
      score: 0,
      history: [],
      avatar: getRandomAvatar()
    });
    saveToLocalStorage();
    renderRoomPlayers();
    playerNameInput.value = "";
    closeModal(modalAddPlayer);
  } else {
    showHint("Введите имя игрока.");
  }
});

// Открытие модального окна для добавления очков
function openAddPointsModal(playerId) {
  const room = rooms[currentRoomIndex];
  const playerIndex = room.players.findIndex(p => p.id === parseInt(playerId));
  if (playerIndex !== -1) {
    currentPlayerIndex = playerIndex;
    const player = room.players[playerIndex];
    const playerInfo = document.getElementById("player-info");
    playerInfo.innerHTML = `<img src="${player.avatar}" alt="Avatar" style="width: 70px; height: 70px; border-radius: 50%;"> <strong>${player.name}</strong>`;
    playerPointsInput.value = "";
    renderPlayerHistory(playerIndex);
    openModal(modalAddPoints, playerPointsInput);
  } else {
    showHint("Игрок не найден!");
  }
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

addPointsConfirm.addEventListener("click", () => {
  const points = parseInt(playerPointsInput.value.trim(), 10);
  if (!isNaN(points)) {
    const room = rooms[currentRoomIndex];
    const player = room.players[currentPlayerIndex];
    if (player) {
      if (!player.history) player.history = [];
      player.score += points;
      player.history.push(points);
      
      if (player.score === room.maxPoints) {
        player.score = 0; // Обнуляем счёт, если ровно maxPoints
      } else if (player.score > room.maxPoints) {
        checkGameEnd(); // Проверяем конец игры, если очки превышают maxPoints
      }
      
      saveToLocalStorage();
      renderRoomPlayers();
      closeModal(modalAddPoints);
    } else {
      showHint("Игрок не найден!");
    }
  } else {
    showHint("Введите корректное число.");
  }
});

// Обработка конца игры
// restartGameBtn.addEventListener("click", () => {
//   const room = rooms[currentRoomIndex];
//   saveGameHistory();
//   room.players = room.players.map((player) => ({ ...player, score: 0 }));
//   saveToLocalStorage();
//   renderRoomPlayers();
//   modalEndGame.style.display = "none";
// });

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

// Удаление игрока
function openDeletePlayerModal(playerId) {
  const room = rooms[currentRoomIndex];
  const playerIndex = room.players.findIndex(p => p.id === parseInt(playerId));
  if (playerIndex !== -1) {
    currentPlayerIndex = playerIndex;
    modalDeletePlayer.style.display = "flex";
  } else {
    showHint("Игрок не найден!");
  }
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

// Пример вызова при завершении игры
function checkGameEnd() {
  const room = rooms[currentRoomIndex];
  const loser = room.players.find(player => player.score > room.maxPoints);
  if (loser) {
    const winners = room.players
      .filter(player => player.score <= room.maxPoints)
      .sort((a, b) => a.score - b.score); // Сортировка победителей по очкам
    showEndGameModal(loser, winners);
  }
}


// Лоадер
document.addEventListener('DOMContentLoaded', function () {
  const loader = document.getElementById('loader');
  function showLoader() { loader.style.display = 'flex'; }
  function hideLoader() { loader.style.display = 'none'; }
  window.addEventListener('beforeunload', showLoader);
  document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      const target = link.getAttribute('target');
      if (href && !href.startsWith('#') && target !== '_blank') {
        e.preventDefault();
        showLoader();
        setTimeout(() => { window.location.href = href; }, 2000);
      }
    });
  });
  window.addEventListener('load', hideLoader);
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