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
const themeButtons = document.querySelectorAll(".theme-btn"); // Для смены темы

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
  // Найти активную секцию
  const activeSection = document.querySelector(".page.active");

  // Найти соответствующую кнопку
  const activeButton = document.querySelector(`.nav-btn[data-target="${activeSection.id}"]`);

  if (activeButton) {
    activeButton.classList.add("active");
  }
});


navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    // Удаляем класс active со всех кнопок
    navButtons.forEach((btn) => btn.classList.remove("active"));

    // Добавляем класс active на текущую кнопку
    button.classList.add("active");

    // Переключение секций
    const target = button.getAttribute("data-target");
    pages.forEach((page) => page.classList.remove("active"));
    document.getElementById(target).classList.add("active");
  });
});


// Проверка имени при загрузке
document.addEventListener("DOMContentLoaded", () => {
  const playerName = localStorage.getItem("playerName");

  if (!playerName) {
    showNameModal();
  }
});

// Модальное окно "Как вас зовут?"
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
  return `assets/ava/${Math.floor(Math.random() * 5) + 1}.jpg`;
}

// Присвоение аватарки игроку
function assignAvatar(player) {
  player.avatar = getRandomAvatar();
}

// Обновление аватарок при очистке
resetScoresConfirm.addEventListener("click", () => {
  const room = rooms[currentRoomIndex];
  room.players = room.players.map((player) => ({
    ...player,
    avatar: getRandomAvatar(),
    score: 0,
  }));
  saveToLocalStorage();
  renderRoomPlayers();
});

// Отключаем правый клик
document.querySelectorAll('.banner a').forEach((link) => {
  link.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
      event.preventDefault(); // Отключает правый клик
    }
  });
});

document.addEventListener('contextmenu', (event) => {
  event.preventDefault(); // Отключает контекстное меню
});

// На весь блок открывать room-info
document.querySelectorAll('.room-item').forEach((item) => {
  item.addEventListener('click', (event) => {
    if (!event.target.classList.contains('delete-room-btn')) {
      const roomIndex = item.getAttribute('data-room-index');
      openRoom(roomIndex); // Открытие комнаты
    }
  });
});

// Для манифеста
fetch("/manifest.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error("Не удалось загрузить manifest.json");
    }
    return response.json();
  })
  .then((manifest) => {
    const versionElement = document.getElementById("app-version");
    versionElement.textContent = `Версия приложения: ${manifest.version}`;
  })
  .catch((error) => {
    console.error("Ошибка загрузки манифеста:", error);
  });




// Отображение списка комнат
function renderRooms() {
  roomsList.innerHTML = rooms
    .map(
      (room, index) => `
      <li>
        <div class="room-info" onclick="openRoom(${index})">
          <h3>${room.name}</h3>
          <p>Макс. очков: ${room.maxPoints}</p>
        </div>
        <button onclick="openDeleteRoomModal(${index})">
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
    const newRoom = { name: roomName, maxPoints: maxPoints, players: [] };
    rooms.push(newRoom);
    saveToLocalStorage();
    renderRooms();
    roomNameInput.value = "";
    maxPointsInput.value = "";
    document.querySelector(".page.active").classList.remove("active");
    document.getElementById("room-list").classList.add("active");
  } else {
    alert("Введите корректные данные.");
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

// Отображение игроков в комнате
function renderRoomPlayers() {
  const room = rooms[currentRoomIndex];
  roomPlayersList.innerHTML = room.players
    .sort((a, b) => b.score - a.score)
    .map(
      (player, playerIndex) => `
      <div class="card">
        <div class="card-info">
          <h3>${player.name}</h3>
          <p>Очки: <strong>${player.score}</strong></p>
        </div>
        <div class="controls">
          <button onclick="openDeletePlayerModal(${playerIndex})" class="delete-btn">
            <span class="material-icons">delete</span>
          </button>
          <button onclick="openAddPointsModal(${playerIndex})" class="add-btn">
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
  if (playerName) {
    const room = rooms[currentRoomIndex];
    room.players.push({ name: playerName, score: 0 });
    saveToLocalStorage();
    renderRoomPlayers();
    playerNameInput.value = "";
    closeModal(modalAddPlayer);
  } else {
    alert("Введите имя игрока.");
  }
});

// Добавление очков игроку
function openAddPointsModal(playerIndex) {
  currentPlayerIndex = playerIndex;
  playerPointsInput.value = "";
  openModal(modalAddPoints, playerPointsInput);
}

addPointsConfirm.addEventListener("click", () => {
  const points = parseInt(playerPointsInput.value.trim(), 10);
  if (!isNaN(points)) {
    const room = rooms[currentRoomIndex];
    const player = room.players[currentPlayerIndex];
    player.score += points;

    if (player.score > room.maxPoints) {
      endGameMessage.textContent = `Проиграл ${player.name} с ${player.score} очками`;
      modalEndGame.style.display = "flex";
    } else if (player.score === room.maxPoints) {
      player.score = 0;
    }
    saveToLocalStorage();
    renderRoomPlayers();
    closeModal(modalAddPoints);
  } else {
    alert("Введите корректное число.");
  }
});

// Обработка конца игры
restartGameBtn.addEventListener("click", () => {
  const room = rooms[currentRoomIndex];
  room.players = room.players.map((player) => ({ ...player, score: 0 }));
  saveToLocalStorage();
  renderRoomPlayers();
  modalEndGame.style.display = "none";
});

// Сброс очков игроков
resetScoresBtn.addEventListener("click", () => {
  openModal(modalResetScores);
});

resetScoresConfirm.addEventListener("click", () => {
  rooms[currentRoomIndex].players = rooms[currentRoomIndex].players.map((player) => ({
    ...player,
    score: 0,
  }));
  saveToLocalStorage();
  renderRoomPlayers();
  closeModal(modalResetScores);
});

// Удаление игрока
function openDeletePlayerModal(playerIndex) {
  currentPlayerIndex = playerIndex;
  modalDeletePlayer.style.display = "flex";
}

deletePlayerConfirm.addEventListener("click", () => {
  rooms[currentRoomIndex].players.splice(currentPlayerIndex, 1);
  saveToLocalStorage();
  renderRoomPlayers();
  modalDeletePlayer.style.display = "none";
});

deletePlayerCancel.addEventListener("click", () => {
  modalDeletePlayer.style.display = "none";
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
  if (inputField) {
    setTimeout(() => {
      inputField.focus();
    }, 50);
  }
}

function closeModal(modal) {
  modal.style.display = "none";
}


// Смена темы
function initializeTheme() {
  const savedTheme = localStorage.getItem("theme") || "default";
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.className = theme;
  localStorage.setItem("theme", theme);
}

// Обработка изменения темы через селектор
document.getElementById("theme-selector").addEventListener("change", (event) => {
  applyTheme(event.target.value);
});

initializeTheme();

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedTheme = button.dataset.theme;
    applyTheme(selectedTheme);
    localStorage.setItem("theme", selectedTheme);
  });
});

function applyTheme(theme) {
  document.documentElement.className = theme;
  localStorage.setItem("theme", theme);
}

// Закрытие модальных окон для всех кнопок "Отмена" или "Нет"
resetScoresCancel.addEventListener("click", () => {
  closeModal(modalResetScores);
});

deletePlayerCancel.addEventListener("click", () => {
  closeModal(modalDeletePlayer);
});

deleteRoomCancel.addEventListener("click", () => {
  closeModal(modalDeleteRoom);
});

document.querySelectorAll("#modal-cancel").forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(modalAddPlayer);
    closeModal(modalAddPoints);
  });
});

// Функция для закрытия модального окна
function closeModal(modal) {
  modal.style.display = "none";
}

// Автопрокрутка карусели
const carousel = document.querySelector('.carousel');

let scrollAmount = 0;
setInterval(() => {
  scrollAmount += carousel.offsetWidth;
  if (scrollAmount >= carousel.scrollWidth) {
    scrollAmount = 0;
  }
  carousel.scrollTo({
    left: scrollAmount,
    behavior: 'smooth',
  });
}, 30000);


function initializeTheme() {
  const savedTheme = localStorage.getItem("theme") || "default";
  applyTheme(savedTheme);
}

initializeTheme();

fetch('/manifest.json')
  .then((response) => response.json())
  .then((manifest) => {
    const versionElement = document.getElementById('app-version');
    if (versionElement) {
      versionElement.textContent = `v.${manifest.version}`;
    }
  });

// Инициализация приложения
renderRooms();

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
