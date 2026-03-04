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
const navButtons = document.querySelectorAll(".nav-btn[data-target]"); // ← ФИКС: только кнопки с data-target
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
let recentPlayers = JSON.parse(localStorage.getItem("recentPlayers")) || [];
let currentRoomIndex = null;
let currentPlayerIndex = null;

function saveToLocalStorage() {
  localStorage.setItem("rooms", JSON.stringify(rooms));
  localStorage.setItem("recentPlayers", JSON.stringify(recentPlayers));
}

function getSystemTheme() {
  // Если тема уже выбрана вручную — используем её
  const saved = localStorage.getItem("theme");
  if (saved) return saved;
  // Иначе определяем по системе: тёмная → default-black, светлая → default
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "default-black"
    : "default";
}

function initializeTheme() {
  applyTheme(getSystemTheme());

  // Следим за изменением системной темы (если тема не зафиксирована вручную)
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    // Перереагируем только если пользователь не выбирал тему сам
    const saved = localStorage.getItem("theme");
    if (!saved) {
      applyTheme(e.matches ? "default-black" : "default");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const activeSection = document.querySelector(".page.active");
  const activeButton = document.querySelector(`.nav-btn[data-target="${activeSection?.id}"]`);
  if (activeButton) activeButton.classList.add("active");

  const playerName = localStorage.getItem("playerName");
  if (!playerName) showNameModal();

  const roomListSection = document.getElementById("room-list");
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Поиск по названию комнаты...";
  searchInput.classList.add("search-input");
  roomListSection.insertBefore(searchInput, roomsList);
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const filteredRooms = rooms
      .map((room, index) => ({ room, index }))
      .filter(({ room }) => room.name.toLowerCase().includes(query));
    roomsList.innerHTML = filteredRooms.map(({ room, index }) => `
      <li onclick="openRoom(${index})">
        <div class="room-info">
          <div class="room-title">
            <h3>${room.name}</h3>
            ${getModeTag(room)}
          </div>
          <p>Макс. очков: ${room.maxPoints}</p>
        </div>
        <button onclick="event.stopPropagation(); openDeleteRoomModal(${index})">
          <span class="material-icons">delete</span>
        </button>
      </li>
    `).join("");
  });

  migrateData();

  const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
  inputs.forEach((input) => {
    input.addEventListener("input", () => validateInput(input));
    input.addEventListener("blur", () => validateInput(input));
  });

  const currentTheme = getSystemTheme();
  applyTheme(currentTheme);
  const themeSelector = document.getElementById("theme-selector");
  if (themeSelector) themeSelector.value = currentTheme;
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    const target = button.getAttribute("data-target");
    if (!target) return; // защита
    const targetEl = document.getElementById(target);
    if (!targetEl) return; // защита
    pages.forEach((page) => page.classList.remove("active"));
    targetEl.classList.add("active");
    // Обновляем статистику при переходе на главную
    if (target === "create-room") renderHomeStats();
  });
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

function getRandomAvatar() {
  const avatarCount = 128;
  const avatarNumber = Math.floor(Math.random() * avatarCount) + 1;
  return `assets/ava/ava${avatarNumber.toString().padStart(2, '0')}.png`;
}

function getModeTag(room) {
  if (room.mode === 'lose') return '<span class="mode-tag mode-lose">💀Проигрыш</span>';
  if (room.mode === 'goal') return '<span class="mode-tag mode-goal">🎯Цель</span>';
  return '<span class="mode-tag mode-reset">🔄Обнуление</span>';
}

function renderRooms() {
  roomsList.innerHTML = rooms.map((room, index) => `
    <li onclick="openRoom(${index})">
      <div class="room-info">
        <div class="room-title">
          <h3>${room.name}</h3>
          ${getModeTag(room)}
        </div>
        <p>Макс. очков: ${room.maxPoints}</p>
      </div>
      <button onclick="event.stopPropagation(); openDeleteRoomModal(${index})">
        <span class="material-icons">delete</span>
      </button>
    </li>
  `).join("");

  const noRoomsPlaceholder = document.getElementById("no-rooms-placeholder");
  if (rooms.length === 0) {
    noRoomsPlaceholder.style.display = "block";
  } else {
    noRoomsPlaceholder.style.display = "none";
  }
}

createRoomForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = roomNameInput.value.trim();
  const maxPoints = parseInt(maxPointsInput.value.trim(), 10);
  const mode = document.querySelector('input[name="room-mode"]:checked').value;
  if (roomName && maxPoints > 0) {
    const newRoom = {
      name: roomName,
      maxPoints: maxPoints,
      mode: mode,
      players: [],
      createdAt: new Date().toISOString()
    };
    rooms.push(newRoom);
    saveToLocalStorage();
    renderRooms();
    renderHomeStats();
    roomNameInput.value = "";
    maxPointsInput.value = "";
    pages.forEach((page) => page.classList.remove("active"));
    document.getElementById("room-list").classList.add("active");
    navButtons.forEach((btn) => btn.classList.remove("active"));
    document.querySelector(`.nav-btn[data-target="room-list"]`)?.classList.add("active");
  } else {
    showHint("Введите корректные данные.");
  }
});

function openRoom(index) {
  currentRoomIndex = index;
  const room = rooms[index];
  roomTitle.textContent = room.name;
  roomMaxPoints.textContent = room.maxPoints;
  const modeIndicator = document.getElementById("room-mode-indicator");
  if (room.mode === 'reset') {
    modeIndicator.textContent = '🔄Обнуление';
  } else if (room.mode === 'lose') {
    modeIndicator.textContent = '💀Проигрыш';
  } else if (room.mode === 'goal') {
    modeIndicator.textContent = '🎯Цель';
  }
  modeIndicator.classList.toggle('mode-lose', room.mode === 'lose');
  modeIndicator.classList.toggle('mode-goal', room.mode === 'goal');
  renderRoomPlayers();
  pages.forEach((page) => page.classList.remove("active"));
  roomDetailsSection.classList.add("active");
}

let isSortingEnabled = true;
const sortToggle = document.getElementById("sort-toggle");
sortToggle.addEventListener("change", (event) => {
  isSortingEnabled = event.target.checked;
  renderRoomPlayers();
});

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
    playersList.innerHTML = players.map((player) => `
      <div class="card" onclick="openAddPointsModal('${player.id}')">
        <div class="card-info">
          <img src="${player.avatar}" alt="Avatar" style="width: 55px; height: 55px; border-radius: 50%; margin-right: 10px;">
          <div class="player-score">
            <h3>${player.name}</h3>
            <p>Очки: <strong>${player.score}</strong></p>
          </div>  
        </div>
        <div class="controls" onclick="event.stopPropagation()">
          <button onclick="openPlayerStats('${player.id}')" class="stats-btn" title="Статистика">
            <span class="material-icons">bar_chart</span>
          </button>
          <button onclick="openDeletePlayerModal('${player.id}')" class="delete-btn">
            <span class="material-icons">delete</span>
          </button>
          <button onclick="openAddPointsModal('${player.id}')" class="add-btn">
            <span class="material-icons">add</span>
          </button>
        </div>
      </div>
    `).join("");
  }
}

addPlayerConfirm.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim();
  if (playerName && currentRoomIndex !== null) {
    const room = rooms[currentRoomIndex];
    const newPlayer = {
      id: Date.now().toString(),
      name: playerName,
      score: 0,
      avatar: getRandomAvatar(),
      history: []
    };
    room.players.push(newPlayer);
    recentPlayers = [...new Set([playerName, ...recentPlayers])].slice(0, 10);
    saveToLocalStorage();
    renderRoomPlayers();
    modalAddPlayer.style.display = "none";
    playerNameInput.value = "";
  } else {
    showHint("Введите имя игрока.");
  }
});

function renderRecentPlayersChips() {
  const chipsContainer = document.getElementById("recent-players-chips");
  chipsContainer.innerHTML = recentPlayers
    .map(name => `<span class="chip" onclick="selectRecentPlayer('${name}')">${name}</span>`)
    .join("");
}

function selectRecentPlayer(name) {
  playerNameInput.value = name;
}

addPlayerToRoomBtn.addEventListener("click", () => {
  renderRecentPlayersChips();
  openModal(modalAddPlayer, playerNameInput);
});

function openAddPointsModal(playerId) {
  const room = rooms[currentRoomIndex];
  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    showHint("Игрок не найден.");
    return;
  }

  document.getElementById("player-info").innerHTML = `
    <img src="${player.avatar}" alt="Avatar" style="border-radius: 50%;">
    <strong>${player.name}</strong>
  `;

  playerPointsInput.value = "";
  let pointsSign = 1;
  const toggleSignBtn = document.getElementById("toggle-sign");
  const freshToggle = toggleSignBtn.cloneNode(true);
  toggleSignBtn.parentNode.replaceChild(freshToggle, toggleSignBtn);

  freshToggle.innerHTML = '<span class="material-icons">add</span>';
  freshToggle.style.background = "";
  freshToggle.style.color = "";

  freshToggle.addEventListener("click", () => {
    pointsSign *= -1;
    freshToggle.innerHTML = pointsSign === 1 ? '<span class="material-icons">add</span>' : '<span class="material-icons">remove</span>';
    freshToggle.style.background = pointsSign === -1 ? "#e05c5c" : "";
  });

  const historyList = document.getElementById("player-history-list");
  function renderHistory() {
    if (player.history && player.history.length > 0) {
      historyList.innerHTML = player.history.slice(-10).reverse().map((points, i) => {
        const realIndex = player.history.length - 1 - i;
        return `<li style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span>${points > 0 ? '+' : ''}${points}</span>
          <button onclick="deleteHistoryEntry('${player.id}', ${realIndex})" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:16px;line-height:1;padding:0 4px;">✕</button>
        </li>`;
      }).join("");
    } else {
      historyList.innerHTML = "<li>История пуста</li>";
    }
  }
  renderHistory();
  window._currentHistoryRender = renderHistory;

  modalAddPoints.style.display = "flex";
  setTimeout(() => playerPointsInput.focus(), 50);

  const currentConfirmBtn = document.getElementById("add-points-confirm");
  const freshConfirm = currentConfirmBtn.cloneNode(true);
  currentConfirmBtn.parentNode.replaceChild(freshConfirm, currentConfirmBtn);

  const cancelBtn = document.getElementById("cancel-add-points");
  const freshCancel = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(freshCancel, cancelBtn);

  const closeModal = () => { modalAddPoints.style.display = "none"; };

  freshConfirm.addEventListener("click", () => {
    const pointsInput = playerPointsInput.value.trim();
    const points = parseInt(pointsInput, 10) * pointsSign;

    if (isNaN(points) || pointsInput === "") {
      showHint("Введите корректное число очков.");
      return;
    }

    const updatedPlayer = room.players.find(p => p.id === playerId);
    if (!updatedPlayer) {
      showHint("Игрок не найден.");
      closeModal();
      return;
    }

    updatedPlayer.score += points;
    if (!updatedPlayer.history) updatedPlayer.history = [];
    updatedPlayer.history.push(points);

    saveToLocalStorage();
    renderRoomPlayers();
    checkGameEnd();
    closeModal();
    showHint(`Добавлено ${points > 0 ? '+' : ''}${points} очков игроку ${updatedPlayer.name}`);
  });

  freshCancel.addEventListener("click", closeModal);
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

resetScoresBtn.addEventListener("click", () => { openModal(modalResetScores); });

resetScoresConfirm.addEventListener("click", () => {
  const room = rooms[currentRoomIndex];
  room.players = room.players.map((player) => ({ ...player, score: 0, history: [] }));
  saveToLocalStorage();
  renderRoomPlayers();
  closeModal(modalResetScores);
});

function openDeletePlayerModal(playerId) {
  modalDeletePlayer.style.display = "flex";

  const freshConfirm = deletePlayerConfirm.cloneNode(true);
  deletePlayerConfirm.parentNode.replaceChild(freshConfirm, deletePlayerConfirm);
  const freshCancel = deletePlayerCancel.cloneNode(true);
  deletePlayerCancel.parentNode.replaceChild(freshCancel, deletePlayerCancel);

  const closeModal = () => { modalDeletePlayer.style.display = "none"; };

  freshConfirm.addEventListener("click", () => {
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
    closeModal();
  });
  freshCancel.addEventListener("click", closeModal);
}

function migrateData() {
  let changed = false;
  rooms.forEach(room => {
    room.players.forEach(player => {
      if (!player.id) { player.id = Date.now() + Math.floor(Math.random() * 1000); changed = true; }
      if (!player.history) { player.history = []; changed = true; }
      if (!player.avatar) { player.avatar = getRandomAvatar(); changed = true; }
    });
  });
  if (changed) saveToLocalStorage();
}

let gameHistory = JSON.parse(localStorage.getItem("gameHistory")) || [];
let globalGameNumber = JSON.parse(localStorage.getItem("globalGameNumber")) || 0;

function saveGameHistory() {
  const room = rooms[currentRoomIndex];
  const mode = room.mode || 'reset';

  // Для goal: победитель = больше очков (убывающий порядок — [last] = победитель)
  // Для lose/reset: победитель = меньше очков (ascending — [last] = победитель)
  const sortedPlayers = [...room.players].sort((a, b) =>
    mode === 'goal' ? a.score - b.score : b.score - a.score
  );

  globalGameNumber += 1;
  const historyEntry = {
    globalGameNumber,
    roomName: room.name,
    mode,
    endedAt: new Date().toISOString(),
    players: sortedPlayers.map((player, index, array) => ({
      name: player.name,
      score: player.score,
      emoji: index === array.length - 1 ? "🏆" : index === 0 ? "💀" : index === array.length - 2 ? "🥈" : "🎯",
    })),
  };
  gameHistory.push(historyEntry);
  localStorage.setItem("gameHistory", JSON.stringify(gameHistory));
  localStorage.setItem("globalGameNumber", JSON.stringify(globalGameNumber));
  renderHomeStats();
}

function renderGameHistory() {
  const historyContainer = document.getElementById("history-container");
  const historyEmpty = document.getElementById("history-empty");
  const historySummary = document.getElementById("history-summary");

  if (historySummary) {
    if (gameHistory && gameHistory.length > 0) {
      const winCounts = {};
      gameHistory.forEach(entry => {
        const winner = entry.players[entry.players.length - 1];
        if (winner) winCounts[winner.name] = (winCounts[winner.name] || 0) + 1;
      });
      const topPlayer = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0];
      const totalPlayers = new Set(gameHistory.flatMap(e => e.players.map(p => p.name))).size;
      const avgPlayersPerGame = (gameHistory.reduce((s, e) => s + e.players.length, 0) / gameHistory.length).toFixed(1);

      historySummary.innerHTML = `
        <div class="history-stat-row">
          <div class="history-stat-card">
            <span class="history-stat-value">${gameHistory.length}</span>
            <span class="history-stat-label">Игр сыграно</span>
          </div>
          <div class="history-stat-card">
            <span class="history-stat-value">${totalPlayers}</span>
            <span class="history-stat-label">Уникальных игроков</span>
          </div>
          <div class="history-stat-card">
            <span class="history-stat-value">${avgPlayersPerGame}</span>
            <span class="history-stat-label">Игроков в среднем</span>
          </div>
          ${topPlayer ? `<div class="history-stat-card history-stat-champ">
            <span class="history-stat-value">🏆</span>
            <span class="history-stat-label">Чемпион</span>
            <span class="history-stat-name">${topPlayer[0]}</span>
            <span class="history-stat-wins">${topPlayer[1]} побед</span>
          </div>` : ''}
        </div>
      `;
    } else {
      historySummary.innerHTML = '';
    }
  }

  if (!gameHistory || gameHistory.length === 0) {
    historyContainer.innerHTML = "";
    if (historyEmpty) historyEmpty.style.display = "flex";
    return;
  }
  if (historyEmpty) historyEmpty.style.display = "none";

  const activeTab = document.querySelector(".filter-tab.active");
  const filter = activeTab ? activeTab.dataset.filter : "all";
  const searchQuery = (document.getElementById("history-search")?.value || "").toLowerCase();

  let filtered = [...gameHistory].sort((a, b) => b.globalGameNumber - a.globalGameNumber);

  if (searchQuery) {
    filtered = filtered.filter(e => e.roomName.toLowerCase().includes(searchQuery));
  }
  if (filter === "recent") {
    filtered = filtered.slice(0, 5);
  }

  if (filtered.length === 0) {
    historyContainer.innerHTML = `<p style="text-align:center;opacity:0.6;padding:20px;">Ничего не найдено</p>`;
    return;
  }

  historyContainer.innerHTML = filtered.map(entry => {
    const date = new Date(entry.endedAt);
    const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const winner = entry.players[entry.players.length - 1];

    const playersHtml = entry.players.map((player, idx, arr) => {
      const isWinner = idx === arr.length - 1;
      const isLoser = idx === 0;
      const medal = isWinner ? '🏆' : isLoser ? '💀' : idx === arr.length - 2 ? '🥈' : '🎯';
      const rowClass = isWinner ? 'hc-player-row hc-winner' : isLoser ? 'hc-player-row hc-loser' : 'hc-player-row';
      return `
        <div class="${rowClass}">
          <span class="hc-medal">${medal}</span>
          <span class="hc-player-name">${player.name}</span>
          <span class="hc-player-score">${player.score} очков</span>
        </div>`;
    }).join('');

    return `
      <div class="history-card-v2">
        <div class="hc-header">
          <div class="hc-room-info">
            <span class="hc-game-num">#${entry.globalGameNumber}</span>
            <span class="hc-room-name">${entry.roomName}</span>
          </div>
          <div class="hc-header-right">
            <span class="hc-mode-badge hc-mode-${entry.mode || 'reset'}">${
              entry.mode === 'goal' ? '🎯 Цель' : entry.mode === 'lose' ? '💀 Проигрыш' : '🔄 Обнуление'
            }</span>
            <span class="hc-date-day">${dateStr}</span>
            <span class="hc-date-time">${timeStr}</span>
          </div>
        </div>
        <div class="hc-players">${playersHtml}</div>
        <div class="hc-footer">
          <span class="hc-players-count">👥 ${entry.players.length} игроков</span>
          ${winner ? `<span class="hc-winner-label">🏆 ${winner.name}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ===== СТАТИСТИКА НА ГЛАВНОЙ =====
function renderHomeStats() {
  const grid = document.getElementById("home-stats-grid");
  const leaderboard = document.getElementById("home-stats-leaderboard");
  if (!grid) return;

  // Живые данные — всегда актуальны, не зависят от истории игр
  const totalRooms = rooms.length;
  const totalPlayers = new Set(
    rooms.flatMap(r => r.players.map(p => p.name))
  ).size;

  if (!gameHistory || gameHistory.length === 0) {
    grid.innerHTML = `
      <div class="home-stat-item">
        <span class="home-stat-icon">🏠</span>
        <span class="home-stat-value">${totalRooms}</span>
        <span class="home-stat-label">Комнат</span>
      </div>
      <div class="home-stat-item">
        <span class="home-stat-icon">👥</span>
        <span class="home-stat-value">${totalPlayers}</span>
        <span class="home-stat-label">Игроков</span>
      </div>
      <div class="home-stat-item">
        <span class="home-stat-icon">🎮</span>
        <span class="home-stat-value">0</span>
        <span class="home-stat-label">Игр сыграно</span>
      </div>
    `;
    if (leaderboard) leaderboard.innerHTML = '';
    return;
  }

  const totalGames = gameHistory.length;

  const winCounts = {};
  const loseCounts = {};
  gameHistory.forEach(entry => {
    const winner = entry.players[entry.players.length - 1];
    const loser = entry.players[0];
    if (winner) winCounts[winner.name] = (winCounts[winner.name] || 0) + 1;
    if (loser) loseCounts[loser.name] = (loseCounts[loser.name] || 0) + 1;
  });

  const topWinner = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0];
  const topLoser = Object.entries(loseCounts).sort((a, b) => b[1] - a[1])[0];

  grid.innerHTML = `
    <div class="home-stat-item">
      <span class="home-stat-icon">🎮</span>
      <span class="home-stat-value">${totalGames}</span>
      <span class="home-stat-label">Игр сыграно</span>
    </div>
    <div class="home-stat-item">
      <span class="home-stat-icon">👥</span>
      <span class="home-stat-value">${totalPlayers}</span>
      <span class="home-stat-label">Игроков</span>
    </div>
    <div class="home-stat-item">
      <span class="home-stat-icon">🏠</span>
      <span class="home-stat-value">${totalRooms}</span>
      <span class="home-stat-label">Комнат</span>
    </div>
    ${topWinner ? `<div class="home-stat-item home-stat-champ">
      <span class="home-stat-icon">🏆</span>
      <span class="home-stat-value">${topWinner[1]}</span>
      <span class="home-stat-label">Побед у ${topWinner[0]}</span>
    </div>` : ''}
  `;

  if (leaderboard && Object.keys(winCounts).length > 0) {
    const sorted = Object.entries(winCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxWins = sorted[0][1];

    leaderboard.innerHTML = `
      <h3 class="home-leaderboard-title">🏆 Лидерборд побед</h3>
      <div class="home-leaderboard-list">
        ${sorted.map(([name, wins], idx) => {
          const pct = Math.round((wins / maxWins) * 100);
          const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
          return `
            <div class="home-lb-row">
              <span class="home-lb-medal">${medals[idx] || (idx+1)+'.'}</span>
              <span class="home-lb-name">${name}</span>
              <div class="home-lb-bar-wrap">
                <div class="home-lb-bar" style="width:${pct}%"></div>
              </div>
              <span class="home-lb-count">${wins}</span>
            </div>`;
        }).join('')}
      </div>
      ${topLoser && topLoser[0] !== topWinner?.[0] ? `
        <div class="home-lb-antirecord">
          💀 Чаще всех проигрывает: <strong>${topLoser[0]}</strong> (${topLoser[1]} раз)
        </div>` : ''}
    `;
  } else if (leaderboard) {
    leaderboard.innerHTML = '';
  }
}

// ===== ИСТОРИЯ: открытие и фильтры =====
document.getElementById("history-btn").addEventListener("click", () => {
  pages.forEach((page) => page.classList.remove("active"));
  document.getElementById("history-page").classList.add("active");
  navButtons.forEach((btn) => btn.classList.remove("active"));
  renderGameHistory();
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("filter-tab")) {
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    renderGameHistory();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "history-search") renderGameHistory();
});

document.getElementById("add-first-player-btn")?.addEventListener("click", () => {
  openModal(modalAddPlayer, playerNameInput);
});

function openDeleteRoomModal(index) {
  currentRoomIndex = index;
  modalDeleteRoom.style.display = "flex";
}

deleteRoomConfirm.addEventListener("click", () => {
  rooms.splice(currentRoomIndex, 1);
  saveToLocalStorage();
  renderRooms();
  renderHomeStats();
  modalDeleteRoom.style.display = "none";
  pages.forEach((page) => page.classList.remove("active"));
  document.getElementById("room-list").classList.add("active");
});

deleteRoomCancel.addEventListener("click", () => {
  modalDeleteRoom.style.display = "none";
});

function openModal(modal, inputField = null) {
  modal.style.display = "flex";
  if (inputField) setTimeout(() => inputField.focus(), 50);
}

function closeModal(modal) {
  modal.style.display = "none";
}

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

document.querySelectorAll('.mode-radio').forEach(label => {
  label.addEventListener('click', () => {
    document.querySelectorAll('.mode-radio').forEach(l => l.classList.remove('active'));
    label.classList.add('active');
  });
});



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

resetScoresCancel.addEventListener("click", () => closeModal(modalResetScores));
deletePlayerCancel.addEventListener("click", () => closeModal(modalDeletePlayer));
deleteRoomCancel.addEventListener("click", () => closeModal(modalDeleteRoom));
document.getElementById("cancel-add-player").addEventListener("click", () => closeModal(modalAddPlayer));

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
renderHomeStats();

function showEndGameModal(loser, winners) {
  const modal = document.getElementById("modal-end-game");
  document.getElementById("loser-avatar").src = loser.avatar;
  document.getElementById("loser-name").textContent = loser.name;
  document.getElementById("loser-score").textContent = loser.score;
  document.getElementById("winners").innerHTML = winners.map(player => `
    <li>
      <img src="${player.avatar}" alt="Avatar" style="width: 30px; height: 30px; border-radius: 50%;">
      ${player.name} — ${player.score} очков
    </li>
  `).join("");
  modal.style.display = "flex";
}

restartGameBtn.addEventListener("click", () => {
  const room = rooms[currentRoomIndex];
  saveGameHistory();
  room.players = room.players.map((player) => ({ ...player, score: 0, history: [] }));
  saveToLocalStorage();
  renderRoomPlayers();
  modalEndGame.style.display = "none";
});

function deleteHistoryEntry(playerId, entryIndex) {
  const room = rooms[currentRoomIndex];
  const player = room.players.find(p => p.id === playerId);
  if (!player || !player.history) return;
  const points = player.history[entryIndex];
  player.score -= points;
  player.history.splice(entryIndex, 1);
  showHint(`Удалено: ${points > 0 ? '+' : ''}${points} очков`);
  saveToLocalStorage();
  renderRoomPlayers();
  if (window._currentHistoryRender) window._currentHistoryRender();
}

function checkGameEnd() {
  if (currentRoomIndex === null) return;
  const room = rooms[currentRoomIndex];
  const max = room.maxPoints;
  let gameEnded = false;

  for (let player of room.players) {
    if (room.mode === 'goal') {
      if (player.score >= max) {
        const others = room.players.filter(p => p.id !== player.id);
        showWinnerModal(player, others);
        gameEnded = true;
        break;
      }
    } else if (player.score > max) {
      const winners = room.players.filter(p => p.id !== player.id);
      showEndGameModal(player, winners);
      gameEnded = true;
      break;
    } else if (player.score === max) {
      if (room.mode === 'lose') {
        const winners = room.players.filter(p => p.id !== player.id);
        showEndGameModal(player, winners);
        gameEnded = true;
        break;
      } else {
        player.score = 0;
        if (!player.history) player.history = [];
        player.history.push(-max);
        showHint(`${player.name} набрал ровно ${max} очков — счёт обнулён! 🔄`);
      }
    }
  }

  if (gameEnded) return;
  saveToLocalStorage();
  renderRoomPlayers();
}

function showWinnerModal(winner, others) {
  const modal = document.getElementById("modal-winner");
  document.getElementById("winner-avatar").src = winner.avatar;
  document.getElementById("winner-name").textContent = winner.name;
  document.getElementById("winner-score").textContent = winner.score;

  const sorted = [...others].sort((a, b) => b.score - a.score);
  document.getElementById("other-players-list").innerHTML = sorted.length > 0
    ? `<ul>${sorted.map(p => `<li>${p.name} — ${p.score} очков</li>`).join("")}</ul>`
    : "";
  modal.style.display = "flex";

  const freshBtn = document.getElementById("winner-restart-btn").cloneNode(true);
  document.getElementById("winner-restart-btn").replaceWith(freshBtn);
  freshBtn.addEventListener("click", () => {
    const room = rooms[currentRoomIndex];
    saveGameHistory();
    room.players = room.players.map(p => ({ ...p, score: 0, history: [] }));
    saveToLocalStorage();
    renderRoomPlayers();
    modal.style.display = "none";
  });
}

function computeTitles(player, mode) {
  const history = player.history || [];
  const titles = [];
  if (history.length === 0) return titles;
  const positive = history.filter(h => h > 0);
  const negative = history.filter(h => h < 0);
  const isGoal = mode === 'goal';
  if (positive.length === 0) return titles;
  const maxVal = Math.max(...positive);
  const minVal = Math.min(...positive);
  const avg = positive.reduce((a, b) => a + b, 0) / positive.length;
  if (positive.length >= 3) {
    const variance = positive.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / positive.length;
    if (variance < avg * 0.3) titles.push({ icon: "🎯", name: "Снайпер", desc: "Очень стабильные ходы" });
  }
  if (history.length >= 10) titles.push({ icon: "🦾", name: "Железный", desc: "10+ ходов за игру" });
  if (isGoal) {
    if (maxVal >= 50) titles.push({ icon: "💥", name: "Мегаход", desc: `Набрал ${maxVal} за один ход` });
    if (positive.length >= 3 && avg >= 20) titles.push({ icon: "🚀", name: "Ракета", desc: "В среднем 20+ очков за ход" });
    if (positive.length >= 2 && maxVal >= minVal * 3) titles.push({ icon: "🍀", name: "Везунчик", desc: "Огромный разброс" });
  } else {
    if (negative.length > 0) titles.push({ icon: "💀", name: "Обнулятор", desc: "Был обнулён хотя бы раз" });
    if (positive.length >= 3 && avg < 5) titles.push({ icon: "🧊", name: "Аккуратный", desc: "В среднем меньше 5 очков" });
    if (positive.length >= 3 && avg > 20) titles.push({ icon: "🔥", name: "Горе-игрок", desc: "В среднем больше 20 очков" });
    if (maxVal >= 50) titles.push({ icon: "💣", name: "Бомба", desc: `Набрал ${maxVal} за один ход` });
  }
  return titles;
}

function openPlayerStats(playerId) {
  const room = rooms[currentRoomIndex];
  const player = room.players.find(p => p.id === playerId);
  if (!player) return;
  const mode = room.mode;
  const isGoal = mode === 'goal';
  const modal = document.getElementById("modal-player-stats");

  document.getElementById("stats-player-info").innerHTML = `
    <img src="${player.avatar}" alt="Avatar" style="width:50px;height:50px;border-radius:50%;">
    <strong style="font-size:1.1em;">${player.name}</strong>
  `;

  const history = (player.history || []).filter(h => h > 0);
  const allHistory = player.history || [];
  const negCount = allHistory.filter(h => h < 0).length;

  if (history.length === 0) {
    document.getElementById("stats-content").innerHTML = `<p style="opacity:0.6;">Пока нет данных для статистики.</p>`;
    document.getElementById("stats-titles").innerHTML = "";
  } else {
    const sum = history.reduce((a, b) => a + b, 0);
    const avg = (sum / history.length).toFixed(1);
    const maxVal = Math.max(...history);
    const minVal = Math.min(...history);
    const bestVal = isGoal ? maxVal : minVal;
    const worstVal = isGoal ? minVal : maxVal;
    const bestLabel = isGoal ? "Лучший ход 🏆" : "Осторожный ход 🧊";
    const worstLabel = isGoal ? "Худший ход 😬" : "Опасный ход 💣";

    document.getElementById("stats-content").innerHTML = `
      <div style="font-size:0.75em;opacity:0.55;margin-bottom:8px;text-align:center;">
        ${isGoal ? '🎯 Режим Цель — чем больше очков, тем лучше'
          : '⚠️ Режим ' + (mode === 'lose' ? 'Проигрыш' : 'Обнуление') + ' — чем меньше очков, тем лучше'}
      </div>
      <div class="stats-grid">
        <div class="stat-item"><span class="stat-value">${player.score}</span><span class="stat-label">Счёт</span></div>
        <div class="stat-item"><span class="stat-value">${avg}</span><span class="stat-label">Среднее за ход</span></div>
        <div class="stat-item"><span class="stat-value">+${bestVal}</span><span class="stat-label">${bestLabel}</span></div>
        <div class="stat-item"><span class="stat-value">+${worstVal}</span><span class="stat-label">${worstLabel}</span></div>
        <div class="stat-item"><span class="stat-value">${history.length}</span><span class="stat-label">Всего ходов</span></div>
        <div class="stat-item"><span class="stat-value">${negCount > 0 ? negCount : '—'}</span><span class="stat-label">${isGoal ? 'Штрафов' : 'Обнулений'}</span></div>
      </div>
    `;

    const titles = computeTitles(player, mode);
    document.getElementById("stats-titles").innerHTML = titles.length > 0
      ? `<h3 style="margin-bottom:8px;">🏅 Титулы</h3><div class="titles-list">${titles.map(t => `
          <div class="title-badge">
            <span class="title-icon">${t.icon}</span>
            <div><strong>${t.name}</strong><div style="font-size:0.75em;opacity:0.7;">${t.desc}</div></div>
          </div>`).join("")}</div>`
      : `<p style="opacity:0.6;font-size:0.85em;">Продолжай играть, чтобы заработать титулы!</p>`;
  }

  modal.style.display = "flex";
  const freshClose = document.getElementById("stats-close-btn").cloneNode(true);
  document.getElementById("stats-close-btn").replaceWith(freshClose);
  freshClose.addEventListener("click", () => { modal.style.display = "none"; });
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

const loadingText = document.getElementById("loading-text");
if (loadingText) {
  loadingText.textContent = funnyTexts[Math.floor(Math.random() * funnyTexts.length)];
}

window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");
      setTimeout(() => { loader.style.display = "none"; }, 600);
    }, 800);
  }
});

function navigateTo(pageId) {
  pages.forEach((page) => page.classList.remove("active"));
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.add("active");
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-target") === pageId);
  });
}

document.getElementById("clear-cache-btn").addEventListener("click", () => {
  clearCacheModal.style.display = "block";
});

cancelClearCache.addEventListener("click", () => {
  clearCacheModal.style.display = "none";
});

confirmClearCache.addEventListener("click", async () => {
  clearCacheModal.style.display = "none";
  // Чистим localStorage и sessionStorage
  localStorage.clear();
  sessionStorage.clear();
  // Ждём удаления всех кэшей SW
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
  }
  // Дерегистрируем Service Worker
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }
  // Жёсткая перезагрузка минуя кэш браузера
  window.location.reload(true);
});

window.addEventListener('resize', () => {
  const inputField = document.activeElement;
  if (inputField?.tagName === 'INPUT' || inputField?.tagName === 'TEXTAREA') {
    inputField.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const canvas = document.querySelector('#snow-overlay canvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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
  const particleCount = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 30 : 60;
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      size: Math.random() * 15 + 10,
      speedY: Math.random() * 2 + 1,
      amp: Math.random() * 30 + 10,
      freq: Math.random() * 0.02 + 0.01,
      phase: Math.random() * Math.PI * 2,
      rotSpeed: Math.random() * 0.02 - 0.01,
      angle: 0,
      layer: Math.random(),
    });
  }
  let animFrameId;
  function animate() {
    if (document.hidden) {
      animFrameId = requestAnimationFrame(animate);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.y += p.speedY;
      p.phase += p.freq;
      p.x += Math.sin(p.phase) * (p.amp / 10);
      p.angle += p.rotSpeed;
      const opacity = 0.2 + (1 - p.layer) * 0.8;
      if (p.y > canvas.height + p.size) {
        p.y = -p.size;
        p.x = Math.random() * canvas.width;
        p.phase = Math.random() * Math.PI * 2;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.font = `${p.size * (1 - p.layer * 0.3)}px serif`;
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fillText(p.symbol, -p.size / 2, p.size / 2);
      ctx.restore();
    });
    animFrameId = requestAnimationFrame(animate);
  }
  animate();
}



createSnow();

let newWorker;
function showUpdateToast() {
  const toast = document.getElementById("update-toast");
  toast.style.display = "block";
  setTimeout(() => {
    if (newWorker) newWorker.postMessage({ action: 'skipWaiting' });
    setTimeout(() => window.location.reload(), 1000);
  }, 5000);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js', { scope: '/' })
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