/**
 * TrackIt - Refactored Script
 * Версия 3.6 с полным рефакторингом
 *
 * Улучшения:
 * ✅ Исправлены утечки памяти
 * ✅ Закрыта XSS уязвимость
 * ✅ Внедрено управление состоянием
 * ✅ Добавлена обработка ошибок
 * ✅ Оптимизирована производительность
 * ✅ Модуляризирован код
 */

// ============================================================================
// УПРАВЛЕНИЕ СОСТОЯНИЕМ
// ============================================================================

// ✅ ИСПРАВЛЕНИЕ: раньше ID игрока делался как `player_${name}`.replace(/[^a-z0-9_]/gi, '_') —
// регулярка [^a-z0-9_] матчит только латиницу, поэтому ЛЮБАЯ кириллическая буква
// заменялась на "_". В итоге у разных русских имён одинаковой длины получался
// абсолютно одинаковый ID (сплошные подчёркивания), и все игроки, кроме первого
// добавленного в комнату, "делили" его ID — из-за этого начисление очков всегда
// применялось к первому найденному по ID игроку. Стабильный хеш от имени работает
// с любым алфавитом и не зависит от длины совпадений.
function generatePlayerId(name) {
  const normalized = (name || '').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `player_${(hash >>> 0).toString(36)}`;
}

class GameState {
  constructor() {
    this.rooms = this.loadRooms();
    this.gameHistory = this.loadGameHistory();
    this.recentPlayers = this.loadRecentPlayers();
    this.allPlayers = this.loadAllPlayers(); // ✅ Архив всех игроков
    this.currentRoomIndex = null;
    this.observers = [];
  }

  loadRooms() {
    try {
      const stored = localStorage.getItem("rooms");
      let rooms = stored ? JSON.parse(stored) : [];

      // Флаг для отслеживания была ли миграция
      const migrationKey = "_roomsMigrated";
      const wasMigrated = localStorage.getItem(migrationKey) === "true";

      if (!wasMigrated) {
        // ПЕРВАЯ МИГРАЦИЯ - сделать один раз безопасно
        rooms = rooms.map(room => {
          if (room.players && Array.isArray(room.players)) {
            room.players = room.players.map(player => {
              // Если ID нет - создать уникальный по имени
              if (!player.id) {
                // Используем стабильный ID на основе имени (будет одинаковый всегда)
                player.id = generatePlayerId(player.name);
              }
              // Если нет аватара
              if (!player.avatar) {
                player.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=random`;
              }
              // Если нет других полей
              if (player.score === undefined) player.score = 0;
              if (!player.history) player.history = [];

              return player;
            });
          }

          // Стандартные поля комнаты
          if (!room.createdAt) room.createdAt = new Date().toISOString();
          if (!room.mode) room.mode = 'reset';
          if (room.gamesPlayed === undefined) room.gamesPlayed = 0;

          return room;
        });

        // Пометить что миграция сделана
        localStorage.setItem(migrationKey, "true");
        localStorage.setItem("rooms", JSON.stringify(rooms));
      }

      // ВТОРАЯ МИГРАЦИЯ - объединить игроков с одинаковым именем но разными ID
      const mergeKey = "_playersMerged";
      const wasMerged = localStorage.getItem(mergeKey) === "true";

      if (!wasMerged) {
        console.log("🔄 Миграция: объединение игроков с одинаковым именем...");
        // Собираем map: имя -> [ID1, ID2, ...]
        const nameToIds = {};
        rooms.forEach(room => {
          if (room.players && Array.isArray(room.players)) {
            room.players.forEach(player => {
              const key = player.name.toLowerCase();
              if (!nameToIds[key]) nameToIds[key] = new Set();
              nameToIds[key].add(player.id);
            });
          }
        });

        // Для каждого имени с несколькими ID
        const idMapping = {}; // oldId -> newId
        Object.entries(nameToIds).forEach(([name, idSet]) => {
          if (idSet.size > 1) {
            // Выбираем основной ID (берём первый, предпочтительно с префиксом "player_")
            const ids = Array.from(idSet);
            const primaryId = ids.find(id => id.startsWith('player_')) || ids[0];

            // Все остальные ID переводим на основной
            ids.forEach(id => {
              if (id !== primaryId) {
                idMapping[id] = primaryId;
              }
            });
          }
        });

        // Применяем отображение ID во всех комнатах
        if (Object.keys(idMapping).length > 0) {
          rooms = rooms.map(room => {
            if (room.players && Array.isArray(room.players)) {
              // Переводим ID и удаляем дубликаты
              const playerMap = {};
              room.players.forEach(player => {
                const newId = idMapping[player.id] || player.id;
                if (!playerMap[newId]) {
                  playerMap[newId] = { ...player, id: newId };
                }
              });
              room.players = Object.values(playerMap);
            }
            return room;
          });
        }

        localStorage.setItem(mergeKey, "true");
        localStorage.setItem("rooms", JSON.stringify(rooms));
        console.log("✅ Миграция завершена. Объединено ID:", Object.keys(idMapping).length);
      }

      // ✅ ТРЕТЬЯ МИГРАЦИЯ - развести ID, которые оказались одинаковыми у РАЗНЫХ игроков
      // из-за старого бага (кириллица в имени превращалась в подчёркивания, и разные
      // имена одинаковой длины получали идентичный ID). Пока это не исправлено,
      // прибавление очков всегда попадало в первого игрока с этим ID.
      const idFixKey = "_playerIdsFixed";
      const wasIdFixed = localStorage.getItem(idFixKey) === "true";

      if (!wasIdFixed) {
        console.log("🔄 Миграция: разведение коллизий ID игроков...");
        // id -> Set различных имён (в нижнем регистре), которые встречались под этим id
        const idToNames = {};
        rooms.forEach(room => {
          (room.players || []).forEach(p => {
            if (!p.id) return;
            const key = p.name.toLowerCase();
            if (!idToNames[p.id]) idToNames[p.id] = new Set();
            idToNames[p.id].add(key);
          });
        });

        const usedIds = new Set(Object.keys(idToNames));
        // "oldId|||имя" -> новый уникальный ID
        const nameToNewId = {};

        Object.entries(idToNames).forEach(([oldId, namesSet]) => {
          if (namesSet.size <= 1) return; // Коллизии нет — под этим ID один и тот же человек
          namesSet.forEach(name => {
            let candidate = generatePlayerId(name);
            let suffix = 1;
            while (usedIds.has(candidate)) {
              candidate = `${generatePlayerId(name)}_${suffix}`;
              suffix++;
            }
            usedIds.add(candidate);
            nameToNewId[`${oldId}|||${name}`] = candidate;
          });
        });

        if (Object.keys(nameToNewId).length > 0) {
          rooms = rooms.map(room => {
            if (room.players && Array.isArray(room.players)) {
              room.players = room.players.map(p => {
                const key = `${p.id}|||${p.name.toLowerCase()}`;
                if (nameToNewId[key]) {
                  return { ...p, id: nameToNewId[key] };
                }
                return p;
              });
            }
            return room;
          });
          localStorage.setItem("rooms", JSON.stringify(rooms));
          console.log("✅ Разведено коллизий ID:", Object.keys(nameToNewId).length);
        }

        // Сохраняем карту замен в экземпляре, чтобы применить её же к истории игр
        // и архиву игроков (они грузятся следующими шагами конструктора)
        this._playerIdFixMapping = nameToNewId;
        localStorage.setItem(idFixKey, "true");
      } else {
        this._playerIdFixMapping = null;
      }

      return rooms;
    } catch (error) {
      console.error("❌ Ошибка загрузки комнат:", error);
      return [];
    }
  }

  loadGameHistory() {
    try {
      const stored = localStorage.getItem("gameHistory");
      let history = stored ? JSON.parse(stored) : [];

      // Флаг для отслеживания была ли миграция
      const migrationKey = "_historyMigrated";
      const wasMigrated = localStorage.getItem(migrationKey) === "true";

      if (!wasMigrated) {
        // ПЕРВАЯ МИГРАЦИЯ - сделать один раз безопасно
        history = history.map(game => {
          if (game.players && Array.isArray(game.players)) {
            game.players = game.players.map(player => {
              // Если ID нет - создать стабильный ID
              if (!player.id) {
                player.id = generatePlayerId(player.name);
              }
              return player;
            });
          }
          return game;
        });

        // Пометить что миграция сделана
        localStorage.setItem(migrationKey, "true");
        localStorage.setItem("gameHistory", JSON.stringify(history));
      }

      // ВТОРАЯ МИГРАЦИЯ - конвертировать winnerId/loserId → winnerIds/loserIds
      const convertFormatKey = "_historyConvertedToMultiple";
      const wasFormatConverted = localStorage.getItem(convertFormatKey) === "true";

      if (!wasFormatConverted && history.length > 0) {
        console.log("🔄 Миграция истории: конвертирование winnerId/loserId → winnerIds/loserIds...");
        history = history.map(entry => {
          const mode = entry.mode || 'reset';

          // Конвертируем winnerId → winnerIds
          if (!entry.winnerIds && entry.winnerId) {
            entry.winnerIds = [entry.winnerId];
            delete entry.winnerId;
          }

          // Конвертируем loserId → loserIds
          if (!entry.loserIds && entry.loserId) {
            entry.loserIds = [entry.loserId];
            delete entry.loserId;
          }

          // Если нет winnerIds/loserIds, генерируем на основе mode и players
          if (!entry.winnerIds && entry.players) {
            // Сортируем как в saveGameHistory
            let sorted = [...entry.players].sort((a, b) => a.score - b.score);

            if (mode === 'goal') {
              // ЦЕЛЬ: последний (HIGH score) = победитель, остальные = проигравшие
              entry.winnerIds = [sorted[sorted.length - 1].id];
              entry.loserIds = sorted.slice(0, -1).map(p => p.id);
            } else {
              // ПРОИГРЫШ/ОБНУЛЕНИЕ: первые 3 = победители, последний = проигрыш
              entry.winnerIds = sorted.slice(0, 3).map(p => p.id);
              entry.loserIds = [sorted[sorted.length - 1].id];
            }
          }

          // Устанавливаем primaryWinnerId если его нет
          if (!entry.primaryWinnerId && entry.winnerIds) {
            entry.primaryWinnerId = entry.winnerIds[0];
          }

          return entry;
        });

        localStorage.setItem(convertFormatKey, "true");
        localStorage.setItem("gameHistory", JSON.stringify(history));
        console.log("✅ Конвертирование завершено");
      }

      // ТРЕТЬЯ МИГРАЦИЯ - объединить ID для игроков с одинаковым именем
      const mergeHistoryKey = "_historyPlayersMerged";
      const wasHistoryMerged = localStorage.getItem(mergeHistoryKey) === "true";

      if (!wasHistoryMerged && history.length > 0) {
        console.log("🔄 Миграция истории: объединение ID для игроков с одинаковым именем...");
        // Собираем map: имя -> [ID1, ID2, ...]
        const nameToIds = {};
        history.forEach(entry => {
          if (entry.players && Array.isArray(entry.players)) {
            entry.players.forEach(player => {
              const key = player.name.toLowerCase();
              if (!nameToIds[key]) nameToIds[key] = new Set();
              if (player.id) nameToIds[key].add(player.id);
            });
          }
        });

        // Для каждого имени с несколькими ID
        const idMapping = {}; // oldId -> newId
        Object.entries(nameToIds).forEach(([name, idSet]) => {
          if (idSet.size > 1) {
            const ids = Array.from(idSet);
            const primaryId = ids.find(id => id.startsWith('player_')) || ids[0];
            ids.forEach(id => {
              if (id !== primaryId) {
                idMapping[id] = primaryId;
              }
            });
          }
        });

        // Применяем отображение ID во всей истории
        if (Object.keys(idMapping).length > 0) {
          history = history.map(entry => {
            if (entry.players && Array.isArray(entry.players)) {
              entry.players = entry.players.map(player => ({
                ...player,
                id: idMapping[player.id] || player.id
              }));
            }
            // Переводим winnerIds (новый массив формат)
            if (entry.winnerIds && Array.isArray(entry.winnerIds)) {
              entry.winnerIds = entry.winnerIds.map(id => idMapping[id] || id);
            }
            // Переводим loserIds (новый массив формат)
            if (entry.loserIds && Array.isArray(entry.loserIds)) {
              entry.loserIds = entry.loserIds.map(id => idMapping[id] || id);
            }
            // Переводим primaryWinnerId
            if (entry.primaryWinnerId) entry.primaryWinnerId = idMapping[entry.primaryWinnerId] || entry.primaryWinnerId;
            return entry;
          });
        }

        localStorage.setItem(mergeHistoryKey, "true");
        localStorage.setItem("gameHistory", JSON.stringify(history));
        console.log("✅ Миграция истории завершена. Объединено ID:", Object.keys(idMapping).length);
      }

      // ✅ ЧЕТВЁРТАЯ МИГРАЦИЯ - применить к истории ту же карту разведения коллизий ID,
      // что была построена в loadRooms() для комнат (см. this._playerIdFixMapping)
      if (this._playerIdFixMapping && Object.keys(this._playerIdFixMapping).length > 0) {
        const mapping = this._playerIdFixMapping;
        history = history.map(entry => {
          if (!entry.players) return entry;
          const localIdMap = {}; // старый ID -> новый ID, только в рамках этой записи истории
          entry.players = entry.players.map(p => {
            const key = `${p.id}|||${(p.name || '').toLowerCase()}`;
            if (mapping[key]) {
              localIdMap[p.id] = mapping[key];
              return { ...p, id: mapping[key] };
            }
            return p;
          });
          if (Object.keys(localIdMap).length > 0) {
            if (entry.winnerIds) entry.winnerIds = entry.winnerIds.map(id => localIdMap[id] || id);
            if (entry.loserIds) entry.loserIds = entry.loserIds.map(id => localIdMap[id] || id);
            if (entry.primaryWinnerId) entry.primaryWinnerId = localIdMap[entry.primaryWinnerId] || entry.primaryWinnerId;
          }
          return entry;
        });
        localStorage.setItem("gameHistory", JSON.stringify(history));
      }

      return history;
    } catch (error) {
      console.error("❌ Ошибка загрузки истории:", error);
      return [];
    }
  }

  loadRecentPlayers() {
    try {
      const stored = localStorage.getItem("recentPlayers");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("❌ Ошибка загрузки недавних игроков:", error);
      return [];
    }
  }

  loadAllPlayers() {
    try {
      const stored = localStorage.getItem("allPlayers");
      let players = stored ? JSON.parse(stored) : [];

      // ✅ Применяем ту же карту разведения коллизий ID, что и для комнат/истории
      if (this._playerIdFixMapping && Object.keys(this._playerIdFixMapping).length > 0) {
        const mapping = this._playerIdFixMapping;
        players = players.map(p => {
          const key = `${p.id}|||${(p.name || '').toLowerCase()}`;
          if (mapping[key]) return { ...p, id: mapping[key] };
          return p;
        });
        localStorage.setItem("allPlayers", JSON.stringify(players));
      }

      return players;
    } catch (error) {
      console.error("❌ Ошибка загрузки архива игроков:", error);
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem("rooms", JSON.stringify(this.rooms));
      localStorage.setItem("gameHistory", JSON.stringify(this.gameHistory));
      localStorage.setItem("recentPlayers", JSON.stringify(this.recentPlayers));
      localStorage.setItem("allPlayers", JSON.stringify(this.allPlayers)); // ✅ Сохраняем архив
      this.notifyObservers({ type: 'save' });
    } catch (error) {
      console.error("❌ Ошибка сохранения:", error);
      if (error.name === 'QuotaExceededError') {
        showHint("⚠️ Хранилище переполнено. Очистите кэш.");
      } else {
        showHint("⚠️ Ошибка сохранения данных");
      }
    }
  }

  getCurrentRoom() {
    if (this.currentRoomIndex === null) return null;
    return this.rooms[this.currentRoomIndex] || null;
  }

  setCurrentRoom(index) {
    if (index !== null && (typeof index !== 'number' || index < 0 || index >= this.rooms.length)) {
      console.error(`❌ Некорректный индекс комнаты: ${index}`);
      return false;
    }
    this.currentRoomIndex = index;
    this.notifyObservers({ type: 'room-changed', index });
    return true;
  }

  createRoom(name, maxPoints, mode) {
    if (!name || !name.trim()) throw new Error("Название комнаты не может быть пустым");
    if (!Number.isInteger(maxPoints) || maxPoints <= 0) throw new Error("Максимум очков должен быть положительным");
    if (!['reset', 'lose', 'goal'].includes(mode)) throw new Error(`Неизвестный режим: ${mode}`);

    const newRoom = {
      name: name.trim(),
      maxPoints,
      mode,
      players: [],
      createdAt: new Date().toISOString(),
      gamesPlayed: 0
    };

    this.rooms.push(newRoom);
    this.save();
    return newRoom;
  }

  deleteRoom(index) {
    if (index < 0 || index >= this.rooms.length) throw new Error(`Некорректный индекс: ${index}`);

    // ✅ Архивируем ВСЕ игроков из удаляемой комнаты перед удалением,
    // чтобы они остались доступны в "Редактировать игроков" и при повторном добавлении в комнату
    const room = this.rooms[index];
    if (room && room.players) {
      room.players.forEach(player => {
        const existingIndex = this.allPlayers.findIndex(p => p.id === player.id);
        if (existingIndex !== -1) {
          this.allPlayers[existingIndex] = { ...player };
        } else {
          this.allPlayers.push({ ...player });
        }
      });
    }

    this.rooms.splice(index, 1);
    if (this.currentRoomIndex === index) this.currentRoomIndex = null;
    this.save();
  }

  // ✅ Найти игрока по ID в ЛЮБОЙ комнате (не только в текущей открытой)
  findPlayerInAnyRoom(playerId) {
    for (const room of this.rooms) {
      const found = room.players.find(p => p.id === playerId);
      if (found) return found;
    }
    return null;
  }

  // ✅ Найти игрока по ID где угодно: в живых комнатах или в архиве удалённых комнат
  findPlayerAnywhere(playerId) {
    return this.findPlayerInAnyRoom(playerId) || this.allPlayers.find(p => p.id === playerId) || null;
  }

  addPlayer(name, avatar = null) {
    const room = this.getCurrentRoom();
    if (!room) throw new Error("Текущая комната не установлена");
    if (!name || !name.trim()) throw new Error("Имя игрока не может быть пустым");

    const trimmedName = name.trim();

    // Проверка 1: Нет ли уже в текущей комнате
    const alreadyInRoom = room.players.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (alreadyInRoom) {
      throw new Error("Игрок уже в этой комнате");
    }

    // Проверка 2: Поискать во ВСЕХ комнатах - может быть этот игрок уже существует
    let existingPlayer = null;
    for (const r of this.rooms) {
      const found = r.players.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
      if (found) {
        existingPlayer = found;
        break;
      }
    }

    // ✅ Проверка 3: Поискать в архиве игроков из удалённых комнат
    // (иначе игрок из удалённой комнаты получал бы каждый раз новый ID/аккаунт)
    if (!existingPlayer) {
      existingPlayer = this.allPlayers.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    }

    // Если игрок существует - переиспользовать его ID, но НОВЫЙ аватар каждый раз
    if (existingPlayer) {
      const playerCopy = {
        id: existingPlayer.id,
        name: trimmedName,
        score: 0,
        avatar: avatar || getRandomAvatar(), // Новый аватар каждый раз!
        history: []
      };
      room.players.push(playerCopy);
    } else {
      // Новый игрок - стабильный ID, новый аватар
      const newPlayer = {
        id: generatePlayerId(trimmedName),
        name: trimmedName,
        score: 0,
        avatar: avatar || getRandomAvatar(),
        history: []
      };
      room.players.push(newPlayer);
    }

    if (!this.recentPlayers.includes(trimmedName)) {
      this.recentPlayers.unshift(trimmedName);
      this.recentPlayers = this.recentPlayers.slice(0, 10);
    }
    this.save();
  }

  deletePlayer(playerId) {
    const room = this.getCurrentRoom();
    if (!room) throw new Error("Текущая комната не установлена");
    const index = room.players.findIndex(p => p.id === playerId);
    if (index === -1) throw new Error(`Игрок не найден`);

    // ✅ Архивируем игрока перед удалением
    const player = room.players[index];
    const existingIndex = this.allPlayers.findIndex(p => p.id === playerId);
    if (existingIndex !== -1) {
      this.allPlayers[existingIndex] = player;
    } else {
      this.allPlayers.push(player);
    }

    room.players.splice(index, 1);
    this.save();
  }

  getPlayer(playerId) {
    const room = this.getCurrentRoom();
    if (!room) return null;
    return room.players.find(p => p.id === playerId) || null;
  }

  updatePlayerScore(playerId, points) {
    const player = this.getPlayer(playerId);
    if (!player) throw new Error("Игрок не найден");
    if (typeof points !== 'number') throw new Error("Очки должны быть числом");
    player.score += points;
    if (!player.history) player.history = [];
    player.history.push({
      value: points,
      timestamp: new Date().toISOString()
    });
    this.save();
    return player;
  }

  subscribe(callback) {
    this.observers.push(callback);
    return () => { this.observers = this.observers.filter(cb => cb !== callback); };
  }

  notifyObservers(event) {
    this.observers.forEach(cb => {
      try { cb(event); } catch (e) { console.error("Ошибка в наблюдателе:", e); }
    });
  }

  getStats() {
    // Считаем уникальных игроков по ID из gameHistory (надёжнее при экспорте/импорте)
    const uniquePlayerIds = new Set();
    this.gameHistory.forEach(entry => {
      if (entry.players && Array.isArray(entry.players)) {
        entry.players.forEach(p => {
          if (p.id) uniquePlayerIds.add(p.id);
        });
      }
    });

    // Если истории нет, считаем из текущих комнат
    let totalPlayers = uniquePlayerIds.size;
    if (totalPlayers === 0) {
      totalPlayers = new Set(this.rooms.flatMap(r => r.players.map(p => p.id))).size;
    }

    return {
      totalRooms: this.rooms.length,
      totalPlayers,
      totalGames: this.gameHistory.length
    };
  }
}

// ============================================================================
// УТИЛИТЫ ДЛЯ БЕЗОПАСНОСТИ
// ============================================================================

function formatDateTime(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// ✅ ИСПРАВЛЕНИЕ: экранируем также кавычки, чтобы значение нельзя было использовать
// для выхода за пределы HTML-атрибута (data-*, src, и т.д.). Раньше "/'  не экранировались,
// что позволяло сломать разметку/добавить произвольные атрибуты через имя игрока или комнаты.
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createSafeElement(tag, content = '', className = '') {
  const el = document.createElement(tag);
  if (typeof content === 'string') {
    el.textContent = content;
  } else if (content instanceof HTMLElement) {
    el.appendChild(content);
  }
  if (className) el.className = className;
  return el;
}

// ============================================================================
// МОДАЛЬ ДОБАВЛЕНИЯ ОЧКОВ (ИСПРАВЛЕНА УТЕЧКА ПАМЯТИ)
// ============================================================================

class PointsModal {
  constructor() {
    this.modal = document.getElementById("modal-add-points");
    this.toggleBtn = document.getElementById("toggle-sign");
    this.confirmBtn = document.getElementById("add-points-confirm");
    this.cancelBtn = document.getElementById("cancel-add-points");
    this.pointsInput = document.getElementById("player-points");
    this.playerInfoDiv = document.getElementById("player-info");
    this.historyList = document.getElementById("player-history-list");

    this.pointsSign = 1;
    this.currentPlayerId = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Подпись очков
    this.toggleBtn.addEventListener("click", () => this.toggleSign());

    // Подтверждение
    this.confirmBtn.addEventListener("click", () => this.confirmPoints());

    // Отмена
    this.cancelBtn.addEventListener("click", () => this.close());

    // Закрытие при клике вне модали
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });

    // Enter для подтверждения
    this.pointsInput.addEventListener("keypress", (e) => {
      if (e.key === 'Enter') this.confirmPoints();
    });
  }

  toggleSign() {
    this.pointsSign *= -1;
    this.updateToggleButtonUI();
  }

  updateToggleButtonUI() {
    const icon = this.pointsSign === 1 ? 'add' : 'remove';
    const color = this.pointsSign === -1 ? '#e05c5c' : '';
    this.toggleBtn.innerHTML = `<span class="material-icons">${icon}</span>`;
    this.toggleBtn.style.background = color;
  }

  confirmPoints() {
    const pointsInput = this.pointsInput.value.trim();
    const points = parseInt(pointsInput, 10) * this.pointsSign;

    if (isNaN(points) || pointsInput === "") {
      showHint("Введите корректное число очков.");
      return;
    }

    try {
      const player = gameState.getPlayer(this.currentPlayerId);
      if (!player) {
        showHint("Игрок не найден.");
        this.close();
        return;
      }

      gameState.updatePlayerScore(this.currentPlayerId, points);
      gameState.notifyObservers({ type: 'ui-update' });

      showHint(`Добавлено ${points > 0 ? '+' : ''}${points} очков ${player.name}`);
      this.close();
    } catch (error) {
      console.error("❌ Ошибка при добавлении очков:", error);
      showHint("⚠️ Ошибка при добавлении очков");
    }
  }

  open(playerId) {
    this.currentPlayerId = playerId;

    try {
      const player = gameState.getPlayer(playerId);
      if (!player) {
        showHint("Игрок не найден.");
        return;
      }

      // Отображаем имя игрока в заголовке
      const playerNameHeader = document.getElementById("add-points-player-name");
      if (playerNameHeader) {
        playerNameHeader.textContent = sanitizeText(player.name);
      }

      // Отображаем текущий счёт
      const currentScoreEl = document.getElementById("add-points-current-score");
      if (currentScoreEl) {
        currentScoreEl.textContent = `Текущий счёт: ${player.score}`;
      }

      // Отображаем аватарку игрока
      const playerInfoDiv = document.getElementById("player-info");
      if (playerInfoDiv) {
        playerInfoDiv.innerHTML = '';
        const img = document.createElement('img');
        img.src = player.avatar;
        img.alt = "Avatar";
        img.style.cssText = 'width: 160px; height: 160px; border-radius: 50%; margin: 0 auto 10px; display: block; border: 3px solid var(--secondary-color);';
        playerInfoDiv.appendChild(img);
      }

      this.pointsInput.value = "";
      this.pointsSign = 1;
      this.updateToggleButtonUI();
      this.renderHistory(player.history || []);
      this.modal.style.display = "flex";
      setTimeout(() => this.pointsInput.focus(), 50);
    } catch (error) {
      showHint("⚠️ Ошибка");
    }
  }

  renderHistory(history) {
    this.historyList.innerHTML = '';

    if (!history || history.length === 0) {
      this.historyList.appendChild(createSafeElement('li', 'История пуста'));
      return;
    }

    history.slice(-10).reverse().forEach((entry, i) => {
      const realIndex = history.length - 1 - i;
      const li = createSafeElement('li');
      li.style.cssText = 'display:grid;grid-template-columns:45px 1fr 28px;gap:8px;align-items:center;font-size:0.9em;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:6px;margin-bottom:3px;';

      let displayText;
      let timeText = '';

      if (typeof entry === 'object' && entry !== null) {
        const value = entry.value;
        if (value === "🔄") {
          displayText = "🔄 Обнуление";
        } else {
          displayText = `${typeof value === 'number' && value > 0 ? '+' : ''}${value}`;
        }
        if (entry.timestamp) {
          timeText = formatDateTime(entry.timestamp);
        }
      } else {
        // Обратная совместимость со старыми данными
        if (entry === "🔄") {
          displayText = "🔄 Обнуление";
        } else {
          displayText = `${typeof entry === 'number' && entry > 0 ? '+' : ''}${entry}`;
        }
      }

      // Колонка 1: Очки
      const pointsCell = createSafeElement('div', displayText);
      pointsCell.style.cssText = 'font-weight:600;';
      li.appendChild(pointsCell);

      // Колонка 2: Дата
      const dateCell = createSafeElement('div', timeText || '-');
      dateCell.style.cssText = 'opacity:0.7;font-size:0.85em;';
      li.appendChild(dateCell);

      // Колонка 3: Крестик
      const btn = createSafeElement('button', '✕');
      btn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--secondary-color);font-size:16px;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:background 0.2s;';
      btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(0,0,0,0.1)'; });
      btn.addEventListener('mouseout', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', () => this.deleteHistoryEntry(realIndex));
      li.appendChild(btn);

      this.historyList.appendChild(li);
    });
  }

  deleteHistoryEntry(entryIndex) {
    try {
      const player = gameState.getPlayer(this.currentPlayerId);
      if (!player || !player.history) return;

      const entry = player.history[entryIndex];
      const points = typeof entry === 'object' ? entry.value : entry;
      player.score -= points;
      player.history.splice(entryIndex, 1);

      showHint(`Удалено: ${points > 0 ? '+' : ''}${points} очков`);
      gameState.save();
      gameState.notifyObservers({ type: 'ui-update' });
      this.renderHistory(player.history);
    } catch (error) {
      console.error("❌ Ошибка при удалении записи:", error);
    }
  }

  close() {
    this.modal.style.display = "none";
    this.currentPlayerId = null;
  }
}

// ============================================================================
// КОМПОНЕНТ КАРУСЕЛИ С ОПТИМИЗАЦИЕЙ
// ============================================================================

class AutoScrollCarousel {
  constructor(selector, interval = 7000) {
    this.carousel = document.querySelector(selector);
    if (!this.carousel) return;

    this.interval = interval;
    this.scrollAmount = 0;
    this.isVisible = true;
    this.intervalId = null; // ✅ Сохранять ID интервала
    this.observer = null;   // ✅ Сохранять observer

    this.setupIntersectionObserver();
    this.setupAutoScroll();
  }

  setupIntersectionObserver() {
    // ✅ ИСПРАВЛЕНИЕ: Сохранить observer для возможности отписки
    this.observer = new IntersectionObserver((entries) => {
      this.isVisible = entries[0].isIntersecting;
    }, { threshold: 0.1 });
    this.observer.observe(this.carousel);
  }

  setupAutoScroll() {
    // ✅ ИСПРАВЛЕНИЕ: Сохранить intervalId для очистки
    this.intervalId = setInterval(() => {
      if (this.isVisible && !document.hidden) {
        this.scroll();
      }
    }, this.interval);
  }

  scroll() {
    if (!this.carousel) return;
    this.scrollAmount += this.carousel.offsetWidth - 33;
    if (this.scrollAmount >= this.carousel.scrollWidth) {
      this.scrollAmount = 0;
    }
    this.carousel.scrollTo({ left: this.scrollAmount, behavior: 'smooth' });
  }

  // ✅ ДОБАВЛЕНО: Метод очистки ресурсов
  destroy() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.observer) this.observer.disconnect();
    this.carousel = null;
  }
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

let gameState = null;
let pointsModal = null;

try {
  gameState = new GameState();

  // Инициализация тестовых данных для проверки истории (если пусто)
  if (gameState.gameHistory.length === 0) {
    gameState.gameHistory.push({
      globalGameNumber: 1,
      roomName: "Тестовая комната",
      mode: "reset",
      endedAt: new Date().toISOString(),
      players: [
        { name: "Игрок 1", score: 15, emoji: "💀" },
        { name: "Игрок 2", score: 45, emoji: "🎯" },
        { name: "Игрок 3", score: 100, emoji: "🏆" }
      ]
    });
    gameState.save();
  }
} catch (error) {
  console.error("❌ Ошибка инициализации GameState:", error);
}

try {
  pointsModal = new PointsModal();
} catch (error) {
  console.error("❌ Ошибка инициализации PointsModal:", error);
}

function showHint(message) {
  const hintContainer = document.getElementById("hint-container");
  if (!hintContainer) return;
  hintContainer.textContent = message;
  hintContainer.style.display = "block";
  setTimeout(() => { hintContainer.style.display = "none"; }, 3000);
}

function showNameModal() {
  const modal = document.getElementById("modal-player-name");
  if (!modal) return;
  modal.classList.add("show");
  const confirmButton = document.getElementById("confirm-name");
  if (!confirmButton) return;

  const handleConfirm = () => {
    const inputName = document.getElementById("player-name-input")?.value.trim();
    if (inputName) {
      localStorage.setItem("playerName", inputName);
      modal.classList.remove("show");
      modal.style.display = "none";
      confirmButton.removeEventListener("click", handleConfirm);
    } else {
      showHint("Введите ваше имя");
    }
  };

  confirmButton.addEventListener("click", handleConfirm);
}

function getRandomAvatar() {
  const avatarCount = 128;
  const num = Math.floor(Math.random() * avatarCount) + 1;
  return `assets/ava/ava${num.toString().padStart(2, '0')}.png`;
}

function getModeTag(mode) {
  const tags = {
    'lose': '<span class="mode-tag mode-lose">💀Проигрыш</span>',
    'goal': '<span class="mode-tag mode-goal">🎯Цель</span>',
    'reset': '<span class="mode-tag mode-reset">🔄Обнуление</span>'
  };
  return tags[mode] || tags['reset'];
}

// ============================================================================
// РЕНДЕРИНГ
// ============================================================================

function renderRooms() {
  const roomsList = document.getElementById("rooms");
  if (!roomsList || !gameState) return;

  // Получаем поисковый запрос
  const searchInput = document.getElementById("rooms-search");
  const searchQuery = (searchInput?.value || "").toLowerCase();

  // Фильтруем комнаты по поиску
  let filteredRooms = gameState.rooms;
  if (searchQuery) {
    filteredRooms = gameState.rooms.filter(room =>
      room.name.toLowerCase().includes(searchQuery)
    );
  }

  // ✅ Сортируем: избранные сверху
  filteredRooms.sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    return 0;
  });

  roomsList.innerHTML = filteredRooms.map((room, filteredIndex) => {
    // Найти оригинальный индекс комнаты
    const originalIndex = gameState.rooms.indexOf(room);

    // Режим (эмодзи и цвета)
    const modeConfig = {
      'goal': { icon: '🎯', bgColor: '#f59e0b', fgColor: '#0a3d2b' },
      'lose': { icon: '💀', bgColor: '#ff4d4d', fgColor: '#ffffff' },
      'reset': { icon: '🔄', bgColor: '#47fdad', fgColor: '#0a3d2b' }
    };
    const mode = modeConfig[room.mode] || modeConfig['reset'];

    const playerCount = room.players.length;

    // Считаем максимальный счёт среди игроков
    const maxScore = room.players.length > 0
      ? Math.max(...room.players.map(p => p.score))
      : 0;

    // Считаем процент (от 0 до 100%)
    const progressPercent = room.maxPoints > 0
      ? Math.min(Math.round((maxScore / room.maxPoints) * 100), 100)
      : 0;

    const circumference = 2 * Math.PI * 16; // r=16 для нового размера
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

    return `
    <li onclick="openRoom(${originalIndex})" class="room-card">
      <!-- Иконка режима (40x40) с сердечком если избранная -->
      <div style="position: relative; flex-shrink: 0;">
        <div style="width: 40px; height: 40px; border-radius: 10px; background: ${mode.bgColor}; display: flex; align-items: center; justify-content: center; color: ${mode.fgColor};">
          <span style="font-size: 22px; line-height: 1;">${mode.icon}</span>
        </div>
        ${room.favorite ? '<div style="position: absolute; top: -5px; right: -5px; width: 15px; height: 15px; border-radius: 50%; background: #ff6b6b; display: flex; align-items: center; justify-content: center; border: 2px solid #0a0a0a;"><span style="font-size: 10px; color: white;">❤️</span></div>' : ''}
      </div>

      <!-- Название и мета -->
      <div style="flex: 1; min-width: 0; margin-left: 12px;">
        <h3 style="margin: 0; font-size: 14.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sanitizeText(room.name)}</h3>
        <p style="margin: 2px 0 0 0; font-size: 12px; opacity: 0.65;">${playerCount} игроков · до ${room.maxPoints}</p>
      </div>

      <!-- Progress ring (34px) -->
      <div style="display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <div style="position: relative; width: 34px; height: 34px;">
          <svg viewBox="0 0 34 34" width="34" height="34" style="transform: rotate(-90deg);">
            <circle cx="17" cy="17" r="16" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2"></circle>
            <circle cx="17" cy="17" r="16" fill="none" stroke="var(--secondary-color)" stroke-width="2" style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}; transition: stroke-dashoffset 0.3s ease;"></circle>
          </svg>
          <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600;">${progressPercent}%</div>
        </div>
      </div>

      <!-- Кнопка удалить -->
      <button class="room-delete-btn" onclick="event.stopPropagation(); openDeleteRoomModal(${originalIndex})">
        <span class="material-icons">delete</span>
      </button>
    </li>
  `;
  }).join("");

  const noRoomsPlaceholder = document.getElementById("no-rooms-placeholder");
  if (noRoomsPlaceholder) {
    noRoomsPlaceholder.style.display = filteredRooms.length === 0 && !searchQuery ? "block" : "none";
  }
}

function renderRoomPlayers() {
  if (!gameState) return;

  const room = gameState.getCurrentRoom();
  if (!room) return;

  const playersList = document.getElementById("room-players-list");
  const noPlayersPlaceholder = document.getElementById("no-players-placeholder");
  if (!playersList) return;

  const isSortingEnabled = document.getElementById("sort-toggle")?.checked ?? true;
  let players = [...room.players];
  if (isSortingEnabled) {
    players.sort((a, b) => b.score - a.score);
  }

  // Очистить старые подсвечивания
  rollState.rollHighlightId = null;
  rollState.firstPickId = null;

  if (players.length === 0) {
    playersList.innerHTML = "";
    if (noPlayersPlaceholder) noPlayersPlaceholder.style.display = "block";
  } else {
    if (noPlayersPlaceholder) noPlayersPlaceholder.style.display = "none";
    playersList.innerHTML = players.map((player) => `
      <div class="player-card room-player-row" data-player-id="${sanitizeText(player.id)}" onclick="pointsModal.open('${sanitizeText(player.id)}')">
        <div class="player-card-top">
          <img src="${player.avatar}" alt="Avatar" class="player-card-avatar">
        </div>
        <div class="player-card-content">
          <h3 class="player-card-name">${sanitizeText(player.name)}</h3>
        </div>
        <div class="player-card-score-display">${player.score}</div>
        ${player.history && player.history.length > 1 ? `
          <div class="player-card-graph" onclick="event.stopPropagation()">
            ${createSparkline(player.history, player.id)}
          </div>
        ` : `<div class="player-card-graph" style="width: 70px; height: 30px;"></div>`}
        <div class="player-card-controls" onclick="event.stopPropagation()">
          <button onclick="openDeletePlayerModal('${sanitizeText(player.id)}')" class="player-card-btn delete" title="Удалить">
            <span class="material-icons">delete</span>
          </button>
          <button onclick="pointsModal.open('${sanitizeText(player.id)}')" class="player-card-btn add" title="Добавить очки">
            <span class="material-icons">add</span>
          </button>
        </div>
      </div>
    `).join("");
  }

  // ✅ Показать кнопку "Кто первый начнёт" если 2+ игроков
  const whoStartsBtn = document.getElementById("who-starts-btn");
  if (whoStartsBtn) {
    whoStartsBtn.style.display = players.length >= 2 ? "flex" : "none";
  }
}

function renderHomeStats() {
  const grid = document.getElementById("home-stats-grid");
  const leaderboard = document.getElementById("home-stats-leaderboard");
  if (!grid || !gameState) return;


  const stats = gameState.getStats();
  const gameHistory = gameState.gameHistory;

  if (!gameHistory || gameHistory.length === 0) {
    grid.innerHTML = `
      <div class="home-stat-item">
        <span class="home-stat-icon">🏠</span>
        <span class="home-stat-value">${stats.totalRooms}</span>
        <span class="home-stat-label">Комнат</span>
      </div>
      <div class="home-stat-item">
        <span class="home-stat-icon">👥</span>
        <span class="home-stat-value">${stats.totalPlayers}</span>
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

  const winCounts = {}; // playerId -> count
  const playerNames = {}; // playerId -> current name
  const loseCounts = {}; // playerId -> count

  gameHistory.forEach(entry => {
    // Используем явные winnerIds, loserIds и primaryWinnerId из истории
    // Старый формат может иметь winnerId вместо winnerIds - конвертируем
    const winnerIds = entry.winnerIds || (entry.winnerId ? [entry.winnerId] : []);
    const loserIds = entry.loserIds || (entry.loserId ? [entry.loserId] : []);

    // Считаем ВСЕХ победителей
    winnerIds.forEach(winnerId => {
      const winner = entry.players.find(p => p.id === winnerId);
      if (winner) {
        winCounts[winnerId] = (winCounts[winnerId] || 0) + 1;
        playerNames[winnerId] = winner.name; // Обновляем текущее имя
      }
    });

    // Считаем ВСЕХ проигравших
    loserIds.forEach(loserId => {
      const loser = entry.players.find(p => p.id === loserId);
      if (loser) {
        loseCounts[loserId] = (loseCounts[loserId] || 0) + 1;
        playerNames[loserId] = loser.name; // Обновляем текущее имя
      }
    });
  });

  const topWinnerEntry = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0];
  const topWinner = topWinnerEntry ? [playerNames[topWinnerEntry[0]], topWinnerEntry[1]] : null;

  grid.innerHTML = `
    <div class="home-stat-item">
      <span class="home-stat-icon">🎮</span>
      <span class="home-stat-value">${gameHistory.length}</span>
      <span class="home-stat-label">Игр сыграно</span>
    </div>
    <div class="home-stat-item">
      <span class="home-stat-icon">👥</span>
      <span class="home-stat-value">${stats.totalPlayers}</span>
      <span class="home-stat-label">Игроков</span>
    </div>
    <div class="home-stat-item">
      <span class="home-stat-icon">🏠</span>
      <span class="home-stat-value">${stats.totalRooms}</span>
      <span class="home-stat-label">Комнат</span>
    </div>
    ${topWinner ? `<div class="home-stat-item home-stat-champ">
      <span class="home-stat-icon">🏆</span>
      <span class="home-stat-value">${topWinner[1]}</span>
      <span class="home-stat-label">Побед у ${topWinner[0]}</span>
    </div>` : ''}
  `;

  if (leaderboard && Object.keys(winCounts).length > 0) {
    const sorted = Object.entries(winCounts).sort((a, b) => b[1] - a[1]);
    // Цвета номерного значка места: 1 — золото, 2 — серебро, 3 — бронза, остальные — нейтральный
    const rankColors = [
      { bg: '#f5b942', fg: '#3d2a00' },
      { bg: '#b8c2cc', fg: '#22282e' },
      { bg: '#c98a4b', fg: '#3a2205' },
    ];
    const defaultRankColor = { bg: 'rgba(255,255,255,0.14)', fg: '#fbfbfc' };

    leaderboard.innerHTML = `
      <h3 class="home-leaderboard-title">Топ игроков</h3>
      <div class="home-leaderboard-table">
        ${sorted.map(([playerId, wins], idx) => {
          const losses = loseCounts[playerId] || 0;
          const total = wins + losses;
          const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
          const rc = rankColors[idx] || defaultRankColor;
          const playerName = playerNames[playerId] || 'Игрок';

          // Цвет для рейтинга: зелёный ≥60%, золото ≥40%, красный <40%
          let ratingColor = '#ff6b6b'; // красный
          if (winRate >= 60) ratingColor = 'var(--secondary-color)'; // зелёный
          else if (winRate >= 40) ratingColor = '#f59e0b'; // золото

          const rankNumStyle = idx < 3 ? ` style="background: ${rc.bg}; color: ${rc.fg};"` : '';
          const rankNumClass = idx < 3 ? 'home-lb-rank-num' : 'home-lb-rank-num home-lb-rank-default';

          return `
            <div class="home-lb-player-row">
              <div class="home-lb-rank"><span class="${rankNumClass}"${rankNumStyle}>${idx + 1}</span></div>
              <div class="home-lb-player-name">${sanitizeText(playerName)}</div>
              <div class="home-lb-stats-compact">
                <span>🏆${wins} · 💀${losses}</span>
                <span style="color: ${ratingColor}; font-weight: 600;">${winRate}%</span>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  } else if (leaderboard) {
    leaderboard.innerHTML = '';
  }
}

// Создание мини-спарклайна графика
function createSparkline(history, playerId) {
  if (!history || history.length < 2) return '';

  // Конвертируем в числа (обратная совместимость со старыми данными)
  const data = history.slice(-10).map(entry => {
    if (typeof entry === 'object' && entry !== null) {
      return entry.value;
    }
    return entry;
  }).filter(v => typeof v === 'number');

  if (data.length < 2) return '';

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Создаём координаты для SVG
  const width = 100;
  const height = 40;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const playerId_safe = sanitizeText(playerId || '');

  // Получаем цвет из CSS переменной (используем secondary-color для видимости)
  const computedStyle = getComputedStyle(document.documentElement);
  const secondaryColor = computedStyle.getPropertyValue('--secondary-color').trim() || '#47fdad';
  const strokeColor = secondaryColor;
  const fillColor = secondaryColor;

  return `
    <svg class="sparkline-chart" data-player-id="${playerId_safe}" onclick="openPlayerStats('${playerId_safe}'); event.stopPropagation();" style="width: 70px; height: 30px; cursor: pointer;" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="sparkline-gradient-${playerId_safe}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color: ${fillColor}; stop-opacity: 0.3;" />
          <stop offset="100%" style="stop-color: ${fillColor}; stop-opacity: 0;" />
        </linearGradient>
      </defs>
      <!-- Заливка под графиком -->
      <polyline points="${points} ${width},${height} 0,${height}" fill="url(#sparkline-gradient-${playerId_safe})" opacity="0.4"/>
      <!-- Сама линия -->
      <polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Точки на графике -->
      ${data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        const isLast = i === data.length - 1;
        return `<circle cx="${x}" cy="${y}" r="${isLast ? '3.5' : '2'}" fill="${strokeColor}" opacity="${isLast ? '1' : '0.6'}"/>`;
      }).join('')}
    </svg>
  `;
}

function renderRecentPlayersChips() {
  const chipsContainer = document.getElementById("recent-players-chips");
  if (!chipsContainer) return;

  // ✅ Собрать всех уникальных игроков: из живых комнат И из архива удалённых комнат
  // (раньше сюда попадали только игроки из существующих комнат, и после удаления
  // комнаты человек пропадал отсюда и его нельзя было быстро выбрать заново)
  const uniqueNames = new Set();
  gameState.allPlayers.forEach(player => uniqueNames.add(player.name));
  gameState.rooms.forEach(room => {
    room.players.forEach(player => {
      uniqueNames.add(player.name);
    });
  });

  if (uniqueNames.size === 0) {
    chipsContainer.innerHTML = '';
    return;
  }

  // ✅ Больше не встраиваем имя напрямую в onclick как JS-строку (риск инъекции,
  // если имя содержит кавычку) — используем data-атрибут + addEventListener
  chipsContainer.innerHTML = Array.from(uniqueNames)
    .map(name => `<span class="chip" data-player-name="${sanitizeText(name)}">${sanitizeText(name)}</span>`)
    .join("");

  chipsContainer.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => setPlayerName(chip.dataset.playerName));
  });
}

function setPlayerName(name) {
  const input = document.getElementById("player-name");
  if (input) input.value = name;
}

// ============================================================================
// ✅ СИСТЕМА ИЗБРАННЫХ КОМНАТ
// ============================================================================

function toggleFavorite() {
  const room = gameState.getCurrentRoom();
  if (!room) return;

  // ✅ Переключить статус избранного
  room.favorite = !room.favorite;
  gameState.save();

  // Обновить кнопку
  updateFavoriteButton();

  // Пересчитать список комнат (избранные сверху)
  renderRooms();

  showHint(room.favorite ? "❤️ Добавлено в избранное" : "💔 Удалено из избранного");
}

function updateFavoriteButton() {
  const room = gameState.getCurrentRoom();
  const btn = document.getElementById("favorite-btn");
  const icon = document.getElementById("favorite-icon");

  if (!btn || !icon || !room) return;

  if (room.favorite) {
    btn.classList.add("active");
    icon.textContent = "❤️"; // Red heart
    icon.style.fontSize = "20px";
    btn.title = "Убрать из избранного";
  } else {
    btn.classList.remove("active");
    icon.textContent = "🩶"; // Grey heart
    icon.style.fontSize = "20px";
    btn.title = "Добавить в избранное";
  }
}

function openRoom(index) {
  if (!gameState.setCurrentRoom(index)) return;

  // ✅ Скрыть основной хедер при открытии комнаты
  const appHeader = document.querySelector("header");
  if (appHeader) appHeader.style.display = "none";

  const room = gameState.getCurrentRoom();
  const roomTitle = document.getElementById("room-title");
  const roomMaxPoints = document.getElementById("room-max-points");
  const modeIndicator = document.getElementById("room-mode-indicator");
  const roomCreatedDate = document.getElementById("room-created-date");
  const roomGamesPlayed = document.getElementById("room-games-played");

  if (roomTitle) roomTitle.textContent = sanitizeText(room.name);
  if (roomMaxPoints) roomMaxPoints.textContent = room.maxPoints;
  if (modeIndicator) {
    const modeTexts = { 'reset': 'Обнуление', 'lose': 'Проигрыш', 'goal': 'Цель' };
    modeIndicator.textContent = modeTexts[room.mode] || modeTexts['reset'];
    modeIndicator.className = `mode-indicator mode-${room.mode}`;
  }

  // Информация о комнате
  if (roomCreatedDate && room.createdAt) {
    roomCreatedDate.textContent = formatDateTime(room.createdAt);
  }
  if (roomGamesPlayed) {
    roomGamesPlayed.textContent = room.gamesPlayed || 0;
  }

  // ✅ Обновить иконку избранного
  updateFavoriteButton();

  renderRoomPlayers();
  toggleWhoStartsButton();

  // Очистить состояние анимации
  const resultDiv = document.getElementById("roll-result");
  if (resultDiv) resultDiv.style.display = "none";
  rollState.rollHighlightId = null;
  rollState.firstPickId = null;
  rollState.prevHighlightId = null;

  navigateTo('room-details');
}

function navigateTo(pageId) {
  // Скрыть все страницы
  const pages = document.querySelectorAll(".page");
  pages.forEach(p => {
    p.classList.remove("active");
    p.style.display = "none";
  });

  // Показать нужную страницу
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add("active");
    target.style.display = "block";
  } else {
    return;
  }

  // ✅ Скрыть основной хедер на страницах со своим собственным хедером (комната, история, редактирование)
  // и убрать компенсирующий верхний отступ #main-content, чтобы страница начиналась от самого верха
  const appHeader = document.querySelector("header");
  const hasOwnHeader = (pageId === 'room-details' || pageId === 'history-page' || pageId === 'edit-players-page');
  if (appHeader) {
    appHeader.style.display = hasOwnHeader ? 'none' : '';
  }
  const mainContent = document.getElementById("main-content");
  if (mainContent) {
    mainContent.classList.toggle("no-header-pad", hasOwnHeader);
  }

  // Обновить активную кнопку навбара
  const navButtons = document.querySelectorAll(".nav-btn[data-target]");
  navButtons.forEach(btn => {
    if (btn.getAttribute("data-target") === pageId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Обновить статистику если на главной
  if (pageId === 'create-room') {
    renderHomeStats();
  }
}

// ============================================================================
// СОБЫТИЯ
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  try {

    // Инициализация темы
    const savedTheme = localStorage.getItem("theme") || getSystemTheme();
    applyTheme(savedTheme);
    const selector = document.getElementById("theme-selector");
    if (selector) selector.value = savedTheme;

    // Рендеринг начальных данных
    renderRooms();
    renderRecentPlayersChips();
    renderHomeStats();

    // Установка начальной активной страницы
    const activeSection = document.querySelector(".page.active");
    if (activeSection) {
      const activeButton = document.querySelector(`.nav-btn[data-target="${activeSection.id}"]`);
      if (activeButton) activeButton.classList.add("active");
    }

    // Запросить имя игрока если его нет
    if (!localStorage.getItem("playerName")) {
      showNameModal();
    }

    // Инициализация карусели
    try {
      new AutoScrollCarousel('.carousel');
    } catch (e) {
      console.warn("⚠️ Ошибка инициализации carousel:", e);
    }

    try {
      new AutoScrollCarousel('.carousel1');
    } catch (e) {
      console.warn("⚠️ Ошибка инициализации carousel1:", e);
    }


  } catch (error) {
    console.error("❌ Ошибка инициализации:", error);
    showHint("⚠️ Ошибка при загрузке приложения");
  }
});

// Навигация между страницами
document.addEventListener("DOMContentLoaded", () => {
  const navButtons = document.querySelectorAll(".nav-btn[data-target]");

  navButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const target = button.getAttribute("data-target");
      navigateTo(target);
    });
  });
});

// Делегирование событий для закрытия модалей
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-cancel")) {
    const modal = e.target.closest(".modal");
    if (modal) modal.style.display = "none";
  }
});

// Наблюдатель за состоянием
if (gameState) {
  gameState.subscribe((event) => {
    if (event.type === 'ui-update') {
      renderRoomPlayers();
      checkGameEnd();
    }
  });
}

// ============================================================================
// ФОРМА СОЗДАНИЯ КОМНАТЫ
// ============================================================================

const createRoomForm = document.getElementById("create-room-form");
if (createRoomForm) {
  createRoomForm.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const roomNameEl = document.getElementById("room-name");
      const maxPointsEl = document.getElementById("max-points");
      const modeEl = document.querySelector('input[name="room-mode"]:checked');

      if (!roomNameEl || !maxPointsEl) {
        showHint("⚠️ Элементы формы не найдены");
        return;
      }

      const roomName = roomNameEl.value.trim();
      const maxPoints = parseInt(maxPointsEl.value || "0", 10);
      const mode = modeEl?.value || "reset";

      if (!roomName || maxPoints <= 0) {
        showHint("⚠️ Заполните форму правильно");
        return;
      }

      gameState.createRoom(roomName, maxPoints, mode);
      renderRooms();
      renderHomeStats();

      roomNameEl.value = "";
      maxPointsEl.value = "";
      navigateTo('room-list');
      showHint("✅ Комната создана");
    } catch (error) {
      console.error("❌ Ошибка создания комнаты:", error);
      showHint("⚠️ " + error.message);
    }
  });
} else {
}

// ============================================================================
// ДОБАВЛЕНИЕ ИГРОКА (НОВАЯ ЛОГИКА)
// ============================================================================

// Состояния модалки добавления игрока
let addPlayerModalState = {
  selectedExistingPlayerIds: new Set(),  // ID выбранных существующих игроков
  newPlayerNames: new Set()              // Новые имена в очереди на добавление
};

// ✅ Получить всех уникальных игроков: из живых комнат И из архива удалённых комнат.
// Раньше эта функция смотрела только на gameState.rooms, поэтому игрок из удалённой
// комнаты пропадал из списка "выбрать существующего игрока" безвозвратно.
function getAllUniquePlayers() {
  const playerMap = {};
  // Сначала архивные записи (могут быть устаревшими)
  gameState.allPlayers.forEach(player => {
    playerMap[player.id] = { ...player };
  });
  // Затем живые комнаты — их данные более свежие, перезаписывают архив
  gameState.rooms.forEach(room => {
    room.players.forEach(player => {
      playerMap[player.id] = { ...player };
    });
  });
  return Object.values(playerMap);
}

// Получить ID игроков, уже находящихся в текущей комнате
function getCurrentRoomPlayerIds() {
  const room = gameState.getCurrentRoom();
  if (!room) return new Set();
  return new Set(room.players.map(p => p.id));
}

// Перерисовать список добавления игрока
function renderAddPlayerList() {
  const searchInput = document.getElementById("add-player-search");
  const listContainer = document.getElementById("add-player-list");
  if (!searchInput || !listContainer) return;

  const searchText = searchInput.value.trim().toLowerCase();
  const displayText = searchInput.value.trim();
  const allPlayers = getAllUniquePlayers();
  const currentRoomIds = getCurrentRoomPlayerIds();
  const room = gameState.getCurrentRoom();
  const currentRoomPlayerNames = room ? new Set(room.players.map(p => p.name.toLowerCase())) : new Set();

  // Фильтруем существующих игроков: ищем по имени и исключаем тех, кто в текущей комнате
  const filteredExisting = allPlayers.filter(p => {
    return p.name.toLowerCase().includes(searchText) && !currentRoomIds.has(p.id);
  });

  // HTML список
  let html = '';

  // 1. Проверка: если есть точное совпадение в текущей комнате
  let exactMatchInRoom = false;
  if (displayText && currentRoomPlayerNames.has(displayText.toLowerCase())) {
    exactMatchInRoom = true;
    html += `
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 8px; background: rgba(255,193,29,0.1); border-left: 3px solid #ffc11d; border: 1px solid rgba(255,193,29,0.3);">
        <span class="material-icons" style="color: #ffc11d; font-size: 20px;">info</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #ffc11d;">Данный игрок уже добавлен</div>
          <div style="font-size: 0.85em; opacity: 0.7;">Смените имя чтобы добавить ещё</div>
        </div>
      </div>
    `;
  }
  // 2. Если есть текст поиска, который не совпадает с существующими и не в очереди - показать "Добавить как нового"
  else if (displayText && !allPlayers.some(p => p.name.toLowerCase() === searchText)) {
    if (!addPlayerModalState.newPlayerNames.has(displayText)) {
      html += `
        <div class="add-player-new-item" style="background: color-mix(in srgb, var(--secondary-color) 20%, transparent);" data-player-name="${sanitizeText(displayText)}">
          <span class="material-icons" style="color: var(--secondary-color); font-size: 1.6em;">add_circle</span>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: var(--text-color); font-size: 0.95em;">Добавить <span style="font-weight: 700;">«${sanitizeText(displayText)}»</span> как нового</div>
          </div>
        </div>
      `;
    }
  }

  // 3. Список новых игроков в очереди
  if (addPlayerModalState.newPlayerNames.size > 0) {
    addPlayerModalState.newPlayerNames.forEach(name => {
      const emojis = ['👻', '🤡', '🦄', '🐉', '🧟', '🤖', '👽', '🎃', '🧛', '🕷️', '🦑', '🎯', '💀', '👹', '🧙', '🃏', '🎰', '🦆', '🐸', '🦁'];
      const emojiIndex = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % emojis.length;
      const emoji = emojis[emojiIndex];

      html += `
        <div class="add-player-new-queued" data-player-name="${sanitizeText(name)}" style="display: flex; align-items: center; gap: 10px; padding: 5px 10px; border-radius: var(--br-xs); background: color-mix(in srgb, var(--secondary-color) 20%, transparent); cursor: pointer; transition: all 0.2s ease; border: 1px solid rgba(71,253,173,0.3);">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(71,253,173,0.15); border: 1.5px solid rgba(71,253,173,0.4); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 22px; flex-shrink: 0;">${emoji}</div>
          <div style="display: flex; gap: 10px; align-items: center; min-width: 0; overflow-wrap: break-word;">
            <div style="font-weight: 600; font-size: 0.95em; color: var(--text-color);">${sanitizeText(name)}</div>
            <div style="font-size: 0.75em; opacity: 0.6; color: var(--primary-color); font-weight: 500;">· новый</div>
          </div>
          <div style="flex: 1;"></div>
          <button class="add-player-remove-btn" data-player-name="${sanitizeText(name)}" style="background: none; border: none; color: #999; cursor: pointer; padding: 0 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: color 0.2s ease; width: auto;">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
        </div>
      `;
    });
  }

  // 4. Список существующих игроков (отфильтрованный)
  if (filteredExisting.length > 0) {
    filteredExisting.forEach(player => {
      const isSelected = addPlayerModalState.selectedExistingPlayerIds.has(player.id);
      const checkIcon = isSelected ? 'check_circle' : 'radio_button_unchecked';
      const checkColor = isSelected ? 'var(--secondary-color)' : '#999';

      html += `
        <div class="add-player-existing-item" data-player-id="${sanitizeText(player.id)}" style="display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-radius: var(--br-xs); background: var(--glass-bg); box-shadow: 0px 0px 8px 0px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06); cursor: pointer; transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.15);">
          <div style="width: 40px; height: 40px; border-radius: 50%; background-size: cover; background-position: center; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.2); background-image: url('${player.avatar}');"></div>
          <div style="font-weight: 600; font-size: 0.95em; color: var(--text-color); min-width: 0; overflow-wrap: break-word;">${sanitizeText(player.name)}</div>
          <div style="flex: 1;"></div>
          <span class="material-icons" style="color: ${checkColor}; font-size: 24px; flex-shrink: 0; transition: color 0.2s ease;">${checkIcon}</span>
        </div>
      `;
    });
  }

  // Если ничего нет для показа и нет точного совпадения в комнате
  if (!html || (!filteredExisting.length && !addPlayerModalState.newPlayerNames.size && !exactMatchInRoom && !displayText)) {
    html = '<div style="text-align: center; opacity: 0.6; padding: 20px;">Нет игроков для добавления</div>';
  }

  listContainer.innerHTML = html;

  // Добавить обработчики событий
  listContainer.querySelectorAll('.add-player-new-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerName = el.dataset.playerName;
      addNewPlayerToQueue(playerName);
    });
  });

  listContainer.querySelectorAll('.add-player-existing-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerId = el.dataset.playerId;
      toggleExistingPlayer(playerId);
    });
  });

  listContainer.querySelectorAll('.add-player-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerName = btn.dataset.playerName;
      removeNewPlayerFromQueue(playerName);
    });
  });

  updateAddPlayerButton();
}

// Обновить кнопку "Добавить" с количеством
function updateAddPlayerButton() {
  const btn = document.getElementById("add-player-confirm");
  if (!btn) return;

  const count = addPlayerModalState.selectedExistingPlayerIds.size + addPlayerModalState.newPlayerNames.size;
  btn.textContent = `Добавить (${count})`;
  btn.disabled = count === 0;

  // Стилизация кнопки
  if (count === 0) {
    btn.style.background = '#999';
    btn.style.color = '#fff';
  } else {
    btn.style.background = '#47fdad';
    btn.style.color = '#0a3d2b';
  }
}

// Добавить новое имя в очередь
function addNewPlayerToQueue(name) {
  const trimmed = name.trim();
  if (trimmed && !addPlayerModalState.newPlayerNames.has(trimmed)) {
    addPlayerModalState.newPlayerNames.add(trimmed);
    const searchInput = document.getElementById("add-player-search");
    if (searchInput) searchInput.value = '';
    renderAddPlayerList();
  }
}

// Удалить имя из очереди
function removeNewPlayerFromQueue(name) {
  addPlayerModalState.newPlayerNames.delete(name.trim());
  renderAddPlayerList();
}

// Toggle выбора существующего игрока
function toggleExistingPlayer(playerId) {
  if (addPlayerModalState.selectedExistingPlayerIds.has(playerId)) {
    addPlayerModalState.selectedExistingPlayerIds.delete(playerId);
  } else {
    addPlayerModalState.selectedExistingPlayerIds.add(playerId);
  }
  renderAddPlayerList();
}

// Открыть модалку добавления игрока
const addPlayerToRoomBtn = document.getElementById("add-player-to-room-btn");
if (addPlayerToRoomBtn) {
  addPlayerToRoomBtn.addEventListener("click", () => {
    // Сбросить состояние
    addPlayerModalState.selectedExistingPlayerIds.clear();
    addPlayerModalState.newPlayerNames.clear();

    const modal = document.getElementById("modal-add-player");
    const input = document.getElementById("add-player-search");
    if (modal) {
      modal.style.display = "flex";
      renderAddPlayerList();
    }
    if (input) setTimeout(() => input.focus(), 50);
  });
}

// Кнопка "Добавить"
const addPlayerConfirm = document.getElementById("add-player-confirm");
if (addPlayerConfirm) {
  addPlayerConfirm.addEventListener("click", () => {
    try {
      const room = gameState.getCurrentRoom();
      if (!room) {
        showHint("⚠️ Комната не найдена");
        return;
      }

      let addedCount = 0;

      // 1. Добавить новых игроков
      addPlayerModalState.newPlayerNames.forEach(name => {
        gameState.addPlayer(name);
        addedCount++;
      });

      // 2. Копировать существующих игроков
      const allPlayers = getAllUniquePlayers();
      addPlayerModalState.selectedExistingPlayerIds.forEach(playerId => {
        const existingPlayer = allPlayers.find(p => p.id === playerId);
        if (existingPlayer) {
          const playerCopy = {
            id: existingPlayer.id,
            name: existingPlayer.name,
            score: 0,
            avatar: getRandomAvatar(),
            history: []
          };
          room.players.push(playerCopy);
          addedCount++;
        }
      });

      gameState.save();
      renderRoomPlayers();

      // Закрыть модалку и сбросить состояние
      const modal = document.getElementById("modal-add-player");
      if (modal) modal.style.display = "none";
      addPlayerModalState.selectedExistingPlayerIds.clear();
      addPlayerModalState.newPlayerNames.clear();

      showHint(`✅ Добавлено ${addedCount} ${addedCount === 1 ? 'игрок' : 'игроков'}`);
    } catch (error) {
      console.error("❌ Ошибка добавления игрока:", error);
      showHint("⚠️ " + error.message);
    }
  });
}

// Поиск в реальном времени
const addPlayerSearch = document.getElementById("add-player-search");
if (addPlayerSearch) {
  addPlayerSearch.addEventListener("input", () => {
    renderAddPlayerList();
  });

  // Enter для добавления нового игрока
  addPlayerSearch.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const text = addPlayerSearch.value.trim();
      if (text) {
        addNewPlayerToQueue(text);
      }
    }
  });
}

// ============================================================================
// УДАЛЕНИЕ ИГРОКА
// ============================================================================

function openDeletePlayerModal(playerId) {
  const modal = document.getElementById("modal-delete-player");
  if (modal) modal.style.display = "flex";

  const confirmBtn = document.getElementById("delete-player-confirm");
  const cancelBtn = document.getElementById("delete-player-cancel");

  // ✅ ИСПРАВЛЕНИЕ: Использовать onclick вместо addEventListener + cloneNode
  // Это предотвращает дублирование listeners
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      try {
        gameState.deletePlayer(playerId);
        renderRoomPlayers();
        if (modal) modal.style.display = "none";
        showHint("✅ Игрок удалён");
      } catch (error) {
        console.error("❌ Ошибка удаления игрока:", error);
        showHint("⚠️ " + error.message);
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      if (modal) modal.style.display = "none";
    };
  }
}

// ============================================================================
// УДАЛЕНИЕ КОМНАТЫ
// ============================================================================

function openDeleteRoomModal(index) {
  const modal = document.getElementById("modal-delete-room");
  if (modal) modal.style.display = "flex";

  const confirmBtn = document.getElementById("delete-room-confirm");
  const cancelBtn = document.getElementById("delete-room-cancel");

  // ✅ ИСПРАВЛЕНИЕ: Использовать onclick вместо addEventListener + cloneNode
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      try {
        gameState.deleteRoom(index);
        renderRooms();
        renderHomeStats();
        if (modal) modal.style.display = "none";
        navigateTo('room-list');
        showHint("✅ Комната удалена");
      } catch (error) {
        console.error("❌ Ошибка удаления комнаты:", error);
        showHint("⚠️ " + error.message);
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      if (modal) modal.style.display = "none";
    };
  }
}

// ============================================================================
// ЗАВЕРШЕНИЕ ИГРЫ
// ============================================================================

const endGameBtn = document.getElementById("end-game-btn");
if (endGameBtn) {
  endGameBtn.addEventListener("click", () => {
    const room = gameState.getCurrentRoom();
    if (!room || room.players.length === 0) {
      showHint("⚠️ В комнате нет игроков");
      return;
    }
    const modal = document.getElementById("modal-end-game-confirm");
    if (modal) modal.style.display = "flex";
  });
}

const endGameConfirm = document.getElementById("end-game-confirm");
if (endGameConfirm) {
  endGameConfirm.addEventListener("click", () => {
    const room = gameState.getCurrentRoom();
    if (room && room.players.length > 0) {
      // Вызываем checkGameEnd с принудительным завершением
      // Сортируем игроков по счёту в зависимости от режима
      const mode = room.mode || 'reset';
      let loser, winners;

      if (mode === 'goal') {
        // Режим Цель - кто ближе к цели побеждает
        const sorted = [...room.players].sort((a, b) => b.score - a.score);
        loser = sorted[sorted.length - 1];
        winners = sorted.slice(0, -1);
        showWinnerModal(sorted[0], winners);
      } else if (mode === 'lose') {
        // Режим Проигрыш - кто выше побеждает
        const sorted = [...room.players].sort((a, b) => b.score - a.score);
        loser = sorted[sorted.length - 1];
        winners = sorted.slice(0, -1);
        showEndGameModal(loser, winners);
      } else {
        // Режим Обнуление - кто выше побеждает
        const sorted = [...room.players].sort((a, b) => b.score - a.score);
        loser = sorted[sorted.length - 1];
        winners = sorted.slice(0, -1);
        showEndGameModal(loser, winners);
      }

      const modal = document.getElementById("modal-end-game-confirm");
      if (modal) modal.style.display = "none";
    }
  });
}

const endGameCancel = document.getElementById("end-game-cancel");
if (endGameCancel) {
  endGameCancel.addEventListener("click", () => {
    const modal = document.getElementById("modal-end-game-confirm");
    if (modal) modal.style.display = "none";
  });
}

// СБРОС ОЧКОВ
// ============================================================================

const resetScoresBtn = document.getElementById("reset-scores-btn");
if (resetScoresBtn) {
  resetScoresBtn.addEventListener("click", () => {
    const modal = document.getElementById("modal-reset-scores");
    if (modal) modal.style.display = "flex";
  });
}

const resetScoresConfirm = document.getElementById("reset-scores-confirm");
if (resetScoresConfirm) {
  resetScoresConfirm.addEventListener("click", () => {
    try {
      const room = gameState.getCurrentRoom();
      if (room) {
        room.players.forEach(p => {
          p.score = 0;
          p.history = [];
        });
        // ✅ Сбросить флаг gameEnded при перезагрузке
        room.gameEnded = false;
        gameState.save();
        renderRoomPlayers();
        const modal = document.getElementById("modal-reset-scores");
        if (modal) modal.style.display = "none";
        showHint("✅ Очки сброшены");
      }
    } catch (error) {
      console.error("❌ Ошибка сброса очков:", error);
      showHint("⚠️ Ошибка");
    }
  });
}

// ============================================================================
// ПРОВЕРКА КОНЦА ИГРЫ
// ============================================================================

function checkGameEnd() {
  const room = gameState.getCurrentRoom();
  if (!room) return;

  const max = room.maxPoints;
  const mode = room.mode || 'reset';

  for (let player of room.players) {
    // 🎯 ЦЕЛЬ - первый кто достигнет maxPoints побеждает
    if (mode === 'goal') {
      if (player.score >= max) {
        const others = room.players.filter(p => p.id !== player.id);
        showWinnerModal(player, others);
        return;
      }
    }
    // 💀 ПРОИГРЫШ - кто набирает maxPoints проигрывает
    else if (mode === 'lose') {
      if (player.score >= max) {
        const winners = room.players.filter(p => p.id !== player.id);
        showEndGameModal(player, winners);
        return;
      }
    }
    // 🔄 ОБНУЛЕНИЕ - счёт обнуляется ТОЛЬКО если ровно maxPoints
    else if (mode === 'reset') {
      if (player.score === max) {
        // Ровно равно - ОБНУЛЕНИЕ
        player.score = 0;
        if (!player.history) player.history = [];
        player.history.push({
          value: "🔄",
          timestamp: new Date().toISOString()
        });
        gameState.save();
        renderRoomPlayers();
        showHint(`${sanitizeText(player.name)} набрал ровно ${max} очков — счёт обнулён! 🔄`);
        return;
      } else if (player.score > max) {
        // Больше максимума - ПРОИГРЫШ
        const winners = room.players.filter(p => p.id !== player.id);
        showEndGameModal(player, winners);
        return;
      }
    }
  }
}

function showEndGameModal(loser, winners) {
  const modal = document.getElementById("modal-end-game");
  if (!modal) return;

  const room = gameState.getCurrentRoom();
  if (!room) return;

  const mode = room.mode || 'reset';

  // ✅ Сортируем правильно в зависимости от режима
  let allSorted;
  if (mode === 'goal') {
    // ЦЕЛЬ: больший счёт = лучше, победитель с наивысшим счётом
    allSorted = [...room.players].sort((a, b) => b.score - a.score);
  } else {
    // RESET/LOSE: меньший счёт = лучше, победитель с наименьшим счётом
    allSorted = [...room.players].sort((a, b) => a.score - b.score);
  }

  const winner = allSorted[0];
  const loserPlayer = allSorted[allSorted.length - 1];

  // Показываем режим (с эмодзи на экране конца игры)
  const modeTexts = { 'reset': '🔄 Обнуление', 'lose': '💀 Проигрыш', 'goal': '🎯 Цель' };
  const modeBadge = document.getElementById("end-game-mode-badge");
  if (modeBadge) {
    const modeText = modeTexts[room.mode] || modeTexts['reset'];
    modeBadge.textContent = modeText;
    // Установить цвет текста в зависимости от режима
    if (room.mode === 'reset') {
      modeBadge.style.color = 'var(--secondary-color)';
    } else if (room.mode === 'lose') {
      modeBadge.style.color = '#ff4d4d';
    } else if (room.mode === 'goal') {
      modeBadge.style.color = '#f59e0b';
    }
  }

  const roomNameEl = document.getElementById("end-game-room-name");
  if (roomNameEl) {
    roomNameEl.textContent = sanitizeText(room.name);
  }

  // ✅ НОВЫЙ ДИЗАЙН: Показываем две карточки для RESET/LOSE
  const twoCardsDiv = document.getElementById("end-game-two-cards");
  const winnerCard = document.getElementById("winner-card");

  if (mode === 'goal') {
    // GOAL: Старый стиль - одна карточка победителя
    if (winnerCard) winnerCard.style.display = "block";
    if (twoCardsDiv) twoCardsDiv.style.display = "none";

    const avatarDiv = document.getElementById("winner-avatar-large");
    if (avatarDiv) {
      avatarDiv.innerHTML = `<div style="width: 64px; height: 64px; border-radius: 50%; background: url('${winner.avatar}'); background-size: cover; background-position: center;"></div>`;
    }

    const winnerName = document.getElementById("end-game-winner-name");
    if (winnerName) {
      winnerName.textContent = sanitizeText(winner.name);
    }

    const winnerScore = document.getElementById("end-game-winner-score");
    if (winnerScore) {
      winnerScore.textContent = `${winner.score} очков`;
    }

    // Прогресс бар показываем только в режиме "Цель"
    const winnerBar = document.getElementById("end-game-winner-bar");
    if (winnerBar) {
      const maxScore = room.maxPoints;
      const progressPercent = maxScore > 0 ? Math.min((winner.score / maxScore) * 100, 100) : 0;
      const barFill = winnerBar.querySelector(".end-game-player-bar-fill");
      if (barFill) {
        barFill.style.width = `${progressPercent}%`;
      }
      winnerBar.style.display = 'block';
    }
  } else {
    // RESET/LOSE: Новый стиль - две карточки
    if (winnerCard) winnerCard.style.display = "none";
    if (twoCardsDiv) twoCardsDiv.style.display = "flex";

    // Карточка победителя
    const winnerAvatarSmall = document.getElementById("end-game-winner-avatar-small");
    if (winnerAvatarSmall) {
      winnerAvatarSmall.style.backgroundImage = `url('${winner.avatar}')`;
    }

    const winnerNameSmall = document.getElementById("end-game-winner-name-small");
    if (winnerNameSmall) {
      winnerNameSmall.textContent = sanitizeText(winner.name);
    }

    const winnerScoreSmall = document.getElementById("end-game-winner-score-small");
    if (winnerScoreSmall) {
      winnerScoreSmall.textContent = `${winner.score} очков`;
    }

    // Карточка проигрыша
    const loserAvatarSmall = document.getElementById("end-game-loser-avatar-small");
    if (loserAvatarSmall) {
      loserAvatarSmall.style.backgroundImage = `url('${loserPlayer.avatar}')`;
    }

    const loserNameSmall = document.getElementById("end-game-loser-name-small");
    if (loserNameSmall) {
      loserNameSmall.textContent = sanitizeText(loserPlayer.name);
    }

    const loserScoreSmall = document.getElementById("end-game-loser-score-small");
    if (loserScoreSmall) {
      loserScoreSmall.textContent = `${loserPlayer.score} очков`;
    }
  }

  // ✅ Показываем ВСЕ игроков в списке (allSorted уже отсортирован правильно)
  const otherPlayersDiv = document.getElementById("other-players");
  if (otherPlayersDiv) {
    const medals = ['🥇', '🥈', '🥉'];
    const maxScore = room.maxPoints;

    const html = allSorted.map((p, idx) => {
      // ✅ Определяем эмодзи для каждого игрока
      let emoji;
      let isLoser = false; // Флаг для красного стиля

      if (mode === 'goal') {
        // 🎯 GOAL: только первый (HIGH score) = 🥇, ВСЕ ОСТАЛЬНЫЕ = 💀
        if (idx === 0) {
          emoji = '🥇'; // Первый (единственный победитель с максимальным счётом)
        } else {
          emoji = '💀'; // ВСЕ остальные проигравшие
          isLoser = true;
        }
      } else {
        // RESET/LOSE: медали для первых 3, потом участники, последний = 💀
        if (idx === allSorted.length - 1) {
          emoji = '💀'; // Последний = проигрыш
          isLoser = true;
        } else if (idx < 3) {
          emoji = medals[idx]; // 🥇 🥈 🥉
        } else {
          emoji = '🎯'; // Участники
        }
      }

      // Вычисляем процент для прогресс-бара
      const progressPercent = maxScore > 0 ? Math.min((p.score / maxScore) * 100, 100) : 0;

      // ✅ Добавляем класс для красного стиля проигрывших
      const loserClass = isLoser ? ' end-game-player-row--loser' : '';

      return `
        <div class="end-game-player-row${loserClass}">
          <span style="font-size: 18px; width: 24px; text-align: center; flex-shrink: 0;">${emoji}</span>
          <div class="end-game-player-avatar" style="background: url('${p.avatar}'); background-size: cover; background-position: center;"></div>
          <div class="end-game-player-info">
            <span class="end-game-player-name">${sanitizeText(p.name)}</span>
            <div class="end-game-player-bar">
              <div class="end-game-player-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="end-game-player-score">${p.score}</span>
          </div>
        </div>
      `;
    }).join("");
    otherPlayersDiv.innerHTML = html;
  }

  // Автоматически сохраняем историю игры
  saveGameHistory();

  modal.style.display = "flex";

  // Обработчик кнопки "Начать заново"
  const restartBtn = document.getElementById("end-game-restart-btn");
  if (restartBtn) {
    restartBtn.onclick = () => {
      try {
        const room = gameState.getCurrentRoom();
        if (room) {
          room.players.forEach(p => {
            p.score = 0;
            p.history = [];
          });
          room.gameEnded = false;
          gameState.save();
          renderRoomPlayers();
          modal.style.display = "none";
          showHint("✅ Игра перезагружена");
        }
      } catch (error) {
        console.error("❌ Ошибка перезагрузки игры:", error);
      }
    };
  }

  // Обработчик кнопки "Закрыть"
  const closeBtn = document.getElementById("end-game-close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = "none";
    };
  }
}

function showWinnerModal(winner, others) {
  const modal = document.getElementById("modal-winner");
  if (!modal) return;

  const room = gameState.getCurrentRoom();
  if (!room) return;

  // Показываем режим
  const roomNameEl = document.getElementById("goal-room-name");
  if (roomNameEl) {
    roomNameEl.textContent = sanitizeText(room.name);
  }

  // Показываем победителя в выделенной карточке
  const avatarDiv = document.getElementById("goal-winner-avatar");
  if (avatarDiv) {
    avatarDiv.style.backgroundImage = `url('${winner.avatar}')`;
  }

  const winnerName = document.getElementById("goal-winner-name");
  if (winnerName) {
    winnerName.textContent = sanitizeText(winner.name);
  }

  const winnerScore = document.getElementById("goal-winner-score");
  if (winnerScore) {
    winnerScore.textContent = `${winner.score} очков`;
  }

  // ✅ Показываем ВСЕ остальных игроков отсортированные по убыванию счета
  const otherPlayersDiv = document.getElementById("goal-other-players");
  if (otherPlayersDiv) {
    const medals = ['🥈', '🥉', '🎖️'];
    const sorted = [...others].sort((a, b) => b.score - a.score);

    const html = sorted.map((p, idx) => {
      let emoji;
      let isLoser = false; // Флаг для красного стиля

      // 🎯 GOAL режим: ВСЕ в секции "others" - проигравшие (они не набрали максимум)
      emoji = '💀'; // Все остальные кроме победителя - проигравшие
      isLoser = true;

      // ✅ Добавляем класс для красного стиля проигрывших
      const loserClass = isLoser ? ' end-game-player-row--loser' : '';

      return `
        <div class="end-game-player-row${loserClass}">
          <span style="font-size: 18px; width: 24px; text-align: center; flex-shrink: 0;">${emoji}</span>
          <div class="end-game-player-avatar" style="background: url('${p.avatar}'); background-size: cover; background-position: center;"></div>
          <div class="end-game-player-info">
            <span class="end-game-player-name">${sanitizeText(p.name)}</span>
            <span class="end-game-player-score">${p.score}</span>
          </div>
        </div>
      `;
    }).join("");
    otherPlayersDiv.innerHTML = html;
  }

  // Сохраняем историю игры
  saveGameHistory();

  modal.style.display = "flex";

  // Обработчик кнопки "Начать заново"
  const restartBtn = document.getElementById("goal-restart-btn");
  if (restartBtn) {
    restartBtn.onclick = () => {
      try {
        const room = gameState.getCurrentRoom();
        if (room) {
          room.players.forEach(p => {
            p.score = 0;
            p.history = [];
          });
          room.gameEnded = false;
          gameState.save();
          renderRoomPlayers();
          modal.style.display = "none";
          showHint("✅ Игра перезагружена");
        }
      } catch (error) {
        console.error("❌ Ошибка перезагрузки игры:", error);
      }
    };
  }

  // ✅ ИСПРАВЛЕНИЕ: у кнопки "Закрыть" в модалке победы (#goal-close-btn) не было
  // обработчика вообще — окно можно было закрыть только через "Начать заново".
  const closeBtn = document.getElementById("goal-close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = "none";
    };
  }
}

// ============================================================================
// ИСТОРИЯ ИГР
// ============================================================================

// ✅ НОВАЯ ФУНКЦИЯ: Пересчитывает игру по текущей правильной логике
function recalculateGameResult(entry) {
  if (!entry || !entry.players) return entry;

  const mode = entry.mode || 'reset';

  // Сортируем игроков по текущей правильной логике
  let sortedPlayers;
  if (mode === 'goal') {
    // GOAL: descending (HIGH to LOW), первый = победитель
    sortedPlayers = [...entry.players].sort((a, b) => b.score - a.score);
  } else {
    // RESET/LOSE: ascending (LOW to HIGH)
    sortedPlayers = [...entry.players].sort((a, b) => a.score - b.score);
  }

  // Пересчитываем emoji для каждого игрока
  const correctedPlayers = entry.players.map((player) => {
    const index = sortedPlayers.findIndex(p => p.id === player.id);
    let emoji = "🎯";

    if (mode === 'goal') {
      // 🎯 GOAL: только первый (максимум) = 🥇, остальные = 💀
      if (index === 0) emoji = "🥇";
      else emoji = "💀";
    } else {
      // RESET/LOSE: медали для первых 3, последний = 💀
      if (index === sortedPlayers.length - 1) {
        emoji = "💀"; // Последний = проигрыш
      } else if (index === 0) {
        emoji = "🥇"; // 1 место
      } else if (index === 1) {
        emoji = "🥈"; // 2 место
      } else if (index === 2) {
        emoji = "🥉"; // 3 место
      }
      // остальные остаются с 🎯
    }

    return { ...player, emoji };
  });

  // Пересчитываем winnerIds и loserIds
  let winnerIds = [], loserIds = [];
  if (mode === 'goal') {
    winnerIds = [sortedPlayers[0].id];
    loserIds = sortedPlayers.slice(1).map(p => p.id);
  } else {
    winnerIds = sortedPlayers.slice(0, Math.min(3, sortedPlayers.length - 1)).map(p => p.id);
    loserIds = [sortedPlayers[sortedPlayers.length - 1].id];
  }

  const primaryWinnerId = winnerIds[0] || sortedPlayers[0].id;

  return {
    ...entry,
    players: correctedPlayers,
    winnerIds,
    loserIds,
    primaryWinnerId
  };
}

function saveGameHistory() {
  const room = gameState.getCurrentRoom();
  if (!room) return;

  // ✅ ЗАЩИТА: Не сохранять историю если игра уже была сохранена
  if (room.gameEnded === true) {
    console.warn("⚠️ Попытка сохранить историю дважды");
    return;
  }

  const mode = room.mode || 'reset';

  // Сортируем правильно в зависимости от режима
  let sortedPlayers;
  if (mode === 'goal') {
    // ЦЕЛЬ: descending (HIGH to LOW), первый = победитель с максимальным счётом
    sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  } else {
    // ПРОИГРЫШ и ОБНУЛЕНИЕ: ascending (LOW to HIGH), первый лучший (LOW score), последний проигрыш (HIGH score)
    sortedPlayers = [...room.players].sort((a, b) => a.score - b.score);
  }

  // Определяем winnerIds и loserIds правильно в зависимости от режима
  let winnerIds = [], loserIds = [];

  if (mode === 'goal') {
    // 🎯 ЦЕЛЬ: первый (HIGH score) - ПОБЕДИТЕЛЬ, остальные - ПРОИГРАВШИЕ
    winnerIds = [sortedPlayers[0].id];
    loserIds = sortedPlayers.slice(1).map(p => p.id);
  } else {
    // 💀 ПРОИГРЫШ/ОБНУЛЕНИЕ: последний (HIGH score) - ПРОИГРЫШ, первые 3 - ЛУЧШИЕ
    // Сортировка ascending (LOW to HIGH):
    // [0] = 🥇 1 место (LOW score, дальше от проигрыша)
    // [1] = 🥈 2 место
    // [2] = 🥉 3 место
    // [3+] = 🎯 участники
    // [последний] = 💀 проигрыш (HIGH score)
    loserIds = [sortedPlayers[sortedPlayers.length - 1].id]; // Последний = проигрыш
    // ✅ ИСПРАВКА: Берём первые 3, но НЕ включаем последнего (который проигрыш)
    winnerIds = sortedPlayers.slice(0, Math.min(3, sortedPlayers.length - 1)).map(p => p.id);
  }

  // Для отслеживания статистики выбираем главного победителя (первого из массива)
  const primaryWinnerId = winnerIds[0] || sortedPlayers[0].id;

  const historyEntry = {
    globalGameNumber: gameState.gameHistory.length + 1,
    roomName: room.name,
    mode,
    endedAt: new Date().toISOString(),
    winnerIds, // Массив ВСЕХ победителей
    loserIds, // Массив ВСЕХ проигравших
    primaryWinnerId, // Главный победитель для статистики (первый из winnerIds)
    players: sortedPlayers.map((player, index) => {
      let emoji = "🎯"; // По умолчанию участник

      // ✅ ИСПРАВКА: Логика эмодзи для истории
      if (mode === 'goal') {
        // 🎯 GOAL: только первый (МАКСИМАЛЬНЫЙ score) = 🥇, ВСЕ ОСТАЛЬНЫЕ = 💀
        if (index === 0) emoji = "🥇"; // Первый (максимум) = единственный победитель
        else emoji = "💀"; // ВСЕ остальные проигравшие
      } else {
        // RESET/LOSE: медали для первых 3, потом участники, последний = 💀
        if (index === sortedPlayers.length - 1) {
          emoji = "💀"; // Последний = проигрыш
        } else if (index === 0) {
          emoji = "🥇"; // 1 место (LOW score)
        } else if (index === 1) {
          emoji = "🥈"; // 2 место
        } else if (index === 2) {
          emoji = "🥉"; // 3 место
        } else {
          emoji = "🎯"; // Остальные участники
        }
      }

      return {
        id: player.id,
        name: player.name,
        score: player.score,
        emoji
      };
    })
  };

  gameState.gameHistory.push(historyEntry);

  // Увеличиваем счётчик игр в комнате
  if (room.gamesPlayed === undefined) {
    room.gamesPlayed = 0;
  }
  room.gamesPlayed++;

  // ✅ ЗАЩИТА: Отметить что игра сохранена, чтобы не сохранять дважды
  room.gameEnded = true;

  gameState.save();
  renderHomeStats();
}

function renderHistorySummary() {
  const summary = document.getElementById("history-summary");
  if (!summary || !gameState.gameHistory || gameState.gameHistory.length === 0) {
    if (summary) summary.innerHTML = '';
    return;
  }

  const history = gameState.gameHistory;

  // Подсчитываем статистику - используем ID для идентификации
  const uniquePlayersMap = {}; // playerId -> name (текущее имя)
  const playerWins = {}; // playerId -> количество побед
  let totalPlayers = 0;

  history.forEach(entry => {
    // ✅ Пересчитываем игру по новой правильной логике для статистики
    const correctedEntry = recalculateGameResult(entry);

    totalPlayers += correctedEntry.players.length;
    const winnerIds = correctedEntry.winnerIds;
    correctedEntry.players.forEach(p => {
      uniquePlayersMap[p.id] = p.name; // Обновляем текущее имя игрока
    });
    winnerIds.forEach(winnerId => {
      if (correctedEntry.players.some(p => p.id === winnerId)) {
        playerWins[winnerId] = (playerWins[winnerId] || 0) + 1;
      }
    });
  });

  const avgPlayers = Math.round((totalPlayers / history.length) * 10) / 10;

  // Найти чемпиона - используя ID как ключ, но показывая текущее имя
  const topWinnerEntry = Object.entries(playerWins).sort((a, b) => b[1] - a[1])[0];
  const topWinner = topWinnerEntry ? {
    id: topWinnerEntry[0],
    name: uniquePlayersMap[topWinnerEntry[0]],
    wins: topWinnerEntry[1]
  } : null;

  summary.innerHTML = `
    <div class="history-stats-grid">
      <div class="history-stat-item">
        <span class="history-stat-number">${history.length}</span>
        <span class="history-stat-label">Игр сыграно</span>
      </div>
      <div class="history-stat-item">
        <span class="history-stat-number">${Object.keys(uniquePlayersMap).length}</span>
        <span class="history-stat-label">Уникальных игроков</span>
      </div>
      <div class="history-stat-item history-stat-wide">
        <span class="history-stat-number">${avgPlayers}</span>
        <span class="history-stat-label">Игроков в среднем</span>
      </div>
    </div>
    ${topWinner ? `<div class="history-champion-card">
      <span class="history-stat-label">🏆 Чемпион</span>
      <span class="history-champion-name">${sanitizeText(topWinner.name)}</span>
      <span class="history-champion-wins">${topWinner.wins} побед</span>
    </div>` : ''}
  `;
}

function renderGameHistory() {
  const container = document.getElementById("history-container");
  const empty = document.getElementById("history-empty");
  if (!container) return;

  // Очищаем контейнер перед отображением
  container.textContent = '';

  if (!gameState.gameHistory || gameState.gameHistory.length === 0) {
    renderHistorySummary();
    if (empty) empty.style.display = "flex";
    return;
  }

  // Отображаем статистику сверху
  renderHistorySummary();

  if (empty) empty.style.display = "none";

  const searchQuery = (document.getElementById("history-search")?.value || "").toLowerCase();
  let filtered = [...gameState.gameHistory].sort((a, b) => b.globalGameNumber - a.globalGameNumber);

  if (searchQuery) {
    filtered = filtered.filter(e => e.roomName.toLowerCase().includes(searchQuery));
  }

  container.innerHTML = filtered.map(entry => {
    // ✅ Пересчитываем игру по новой правильной логике
    const correctedEntry = recalculateGameResult(entry);

    const date = new Date(correctedEntry.endedAt);
    const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    // Используем пересчитанные данные
    const winnerIds = correctedEntry.winnerIds;
    const loserIds = correctedEntry.loserIds;
    const primaryWinner = correctedEntry.players.find(p => p.id === correctedEntry.primaryWinnerId);

    const playersHtml = correctedEntry.players.map((player, idx, arr) => `
      <div class="${winnerIds.includes(player.id) ? 'hc-player-row hc-winner' : loserIds.includes(player.id) ? 'hc-player-row hc-loser' : 'hc-player-row'}">
        <span class="hc-medal">${player.emoji}</span>
        <span class="hc-player-name">${sanitizeText(player.name)}</span>
        <span class="hc-player-score">${player.score} очков</span>
      </div>`).join('');

    return `
      <div class="history-card-v2">
        <div class="hc-header">
          <div class="hc-room-info">
            <span class="hc-game-num">#${entry.globalGameNumber}</span>
            <span class="hc-room-name">${sanitizeText(entry.roomName)}</span>
          </div>
          <div class="hc-header-right">
            <span class="hc-mode-badge hc-mode-${entry.mode || 'reset'}">${
              entry.mode === 'goal' ? '🎯 Цель' : entry.mode === 'lose' ? '💀 Проигрыш' : '🔄 Обнуление'
            }</span>
            <span class="hc-date-day">${dateStr}, ${timeStr}</span>
          </div>
        </div>
        <div class="hc-players">${playersHtml}</div>
        <div class="hc-footer">
          <span class="hc-players-count">👥 ${entry.players.length} игроков</span>
          ${primaryWinner ? `<span class="hc-winner-label">🏆 ${sanitizeText(primaryWinner.name)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// СТАТИСТИКА ИГРОКА
// ============================================================================

function openPlayerStats(playerId) {
  const player = gameState.getPlayer(playerId);
  if (!player) return;

  const modal = document.getElementById("modal-player-stats");
  const room = gameState.getCurrentRoom();
  if (!modal || !room) return;

  const statsInfo = document.getElementById("stats-player-info");
  statsInfo.innerHTML = '';
  const img = document.createElement('img');
  img.src = player.avatar;
  img.alt = "Avatar";
  img.style.cssText = 'width:50px;height:50px;border-radius:50%;border:2px solid var(--primary-color);';
  const name = createSafeElement('strong', player.name);
  name.style.fontSize = '1.1em';
  statsInfo.appendChild(img);
  statsInfo.appendChild(name);

  // Конвертируем историю в числа
  const allHistory = (player.history || []).map(h => {
    if (typeof h === 'object' && h !== null) return h.value;
    return h;
  });

  const positiveHistory = allHistory.filter(h => typeof h === 'number' && h > 0);
  const negativeHistory = allHistory.filter(h => typeof h === 'number' && h < 0);
  const statsContent = document.getElementById("stats-content");
  const statsTitles = document.getElementById("stats-titles");

  if (allHistory.length === 0) {
    statsContent.innerHTML = '<p style="opacity:0.6;">Пока нет данных для статистики.</p>';
    if (statsTitles) statsTitles.innerHTML = "";
  } else {
    const sum = allHistory.filter(h => typeof h === 'number').reduce((a, b) => a + b, 0);
    const avg = (sum / allHistory.length).toFixed(1);
    const maxVal = positiveHistory.length > 0 ? Math.max(...positiveHistory) : 0;
    const minVal = negativeHistory.length > 0 ? Math.min(...negativeHistory) : 0;

    const positiveCount = positiveHistory.length;
    const negativeCount = negativeHistory.length;
    const positivePercent = allHistory.length > 0 ? Math.round((positiveCount / allHistory.length) * 100) : 0;
    const negativePercent = allHistory.length > 0 ? Math.round((negativeCount / allHistory.length) * 100) : 0;

    const positiveSum = positiveHistory.reduce((a, b) => a + b, 0);
    const negativeSum = negativeHistory.reduce((a, b) => a + b, 0);

    statsContent.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item"><span class="stat-value">${player.score}</span><span class="stat-label">Счёт</span></div>
        <div class="stat-item"><span class="stat-value">${avg}</span><span class="stat-label">Среднее за ход</span></div>
        <div class="stat-item"><span class="stat-value">${allHistory.length}</span><span class="stat-label">Всего ходов</span></div>

        <div class="stat-item"><span class="stat-value">+${maxVal}</span><span class="stat-label">Лучший ход</span></div>
        <div class="stat-item"><span class="stat-value">${minVal}</span><span class="stat-label">Худший ход</span></div>
        <div class="stat-item"><span class="stat-value">${positiveSum}</span><span class="stat-label">Сумма +</span></div>

        <div class="stat-item"><span class="stat-value">${positiveCount}</span><span class="stat-label">Плюсовых</span></div>
        <div class="stat-item"><span class="stat-value">${negativeCount}</span><span class="stat-label">Минусовых</span></div>
        <div class="stat-item"><span class="stat-value">${negativeSum}</span><span class="stat-label">Сумма -</span></div>

        <div class="stat-item"><span class="stat-value">${positivePercent}%</span><span class="stat-label">% Плюсовых</span></div>
        <div class="stat-item"><span class="stat-value">${negativePercent}%</span><span class="stat-label">% Минусовых</span></div>
      </div>
    `;
  }

  modal.style.display = "flex";

  const closeBtn = document.getElementById("stats-close-btn");
  if (closeBtn) {
    const newBtn = closeBtn.cloneNode(true);
    closeBtn.replaceWith(newBtn);
    newBtn.addEventListener("click", () => { modal.style.display = "none"; });
  }
}

// ============================================================================
// ТЕМЫ
// ============================================================================

function getSystemTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "default-black" : "default";
}

// Справочник типов тем (light/dark)
const THEME_TYPES = {
  'default': 'light',
  'default-black': 'dark',
  'default-violet': 'dark',
  'default-white': 'light',
  'onyx': 'dark',
  'space-explorer': 'light',
  'ocean-depths': 'dark',
  'neon-experiment': 'dark',
  'midnight-meon': 'dark',
  'mystic-pastel': 'dark',
  'forest-harmony': 'dark',
  'new-year': 'dark',
  'golden-hour': 'light',
  'cyberpunk-neon': 'dark',
  'spring-blossom': 'light',
  'autumn-leaves': 'light',
  'galaxy-dreams': 'dark',
  'minimal-elegance': 'light',
  'tropical-sunset': 'dark'
};

function applyTheme(theme) {
  document.documentElement.className = theme;
  // Устанавливаем атрибут data-theme-type для селекторов
  const themeType = THEME_TYPES[theme] || 'dark';
  document.documentElement.setAttribute('data-theme-type', themeType);
  localStorage.setItem("theme", theme);
}

const themeSelector = document.getElementById("theme-selector");
if (themeSelector) {
  themeSelector.addEventListener("change", (e) => {
    applyTheme(e.target.value);
  });
}

// ============================================================================
// РЕДАКТИРОВАНИЕ ИГРОКОВ
// ============================================================================

// Кнопка "Редактировать игроков" в настройках
document.getElementById("edit-players-btn")?.addEventListener("click", () => {
  navigateTo('edit-players-page');
  renderEditPlayersPage();
});

// Кнопка назад на странице редактирования
document.getElementById("back-from-edit-players-btn")?.addEventListener("click", () => {
  navigateTo('settings');
});

// Хранилище текущих данных для модальных окон
let currentEditingPlayers = new Map();

function renderEditPlayersPage() {
  const page = document.getElementById("edit-players-page");
  const list = document.getElementById("edit-players-page-list");
  const empty = document.getElementById("edit-players-empty");

  if (!page || !list) return;

  // ✅ Собрать всех уникальных игроков: сначала из архива (удалённые комнаты),
  // затем из живых комнат (перезаписывают архивные данные более свежими).
  // Раньше здесь смотрели только на gameState.rooms, поэтому игрок из удалённой
  // комнаты полностью пропадал со страницы редактирования.
  currentEditingPlayers.clear();
  gameState.allPlayers.forEach(player => {
    currentEditingPlayers.set(player.id, { name: player.name, avatar: player.avatar });
  });
  gameState.rooms.forEach(room => {
    room.players.forEach(player => {
      currentEditingPlayers.set(player.id, { name: player.name, avatar: player.avatar });
    });
  });

  // Если нет игроков
  if (currentEditingPlayers.size === 0) {
    list.innerHTML = '';
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  // ✅ Получить информацию о всех игроках (очки).
  // Для игроков, оставшихся только в архиве (все их комнаты удалены), берём
  // сохранённый на момент удаления счёт. Для игроков, которые сейчас состоят
  // хотя бы в одной живой комнате, считаем сумму по этим комнатам.
  const playerInfo = {};
  gameState.allPlayers.forEach(player => {
    playerInfo[player.id] = { score: player.score || 0, inLiveRoom: false };
  });
  gameState.rooms.forEach(room => {
    room.players.forEach(player => {
      if (!playerInfo[player.id] || !playerInfo[player.id].inLiveRoom) {
        playerInfo[player.id] = { score: 0, inLiveRoom: true };
      }
      playerInfo[player.id].score += (player.score || 0);
    });
  });

  // Создать элементы для редактирования
  list.innerHTML = Array.from(currentEditingPlayers.entries()).map(([id, player]) => {
    const info = playerInfo[id] || { score: 0 };
    return `
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
        <img src="${player.avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sanitizeText(player.name)}</div>
          <div style="font-size: 0.8em; opacity: 0.6;">${info.score} очков</div>
        </div>
        <button class="player-edit-btn" data-player-id="${id}"
          style="flex-shrink: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(114, 40, 245, 0.3); color: var(--text-color); border: 1px solid rgba(114, 40, 245, 0.5); border-radius: 6px; cursor: pointer; font-size: 1em;">✏️</button>
        <button class="player-merge-btn" data-player-id="${id}"
          style="flex-shrink: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(114, 40, 245, 0.5); color: var(--text-color); border: 1px solid rgba(114, 40, 245, 0.7); border-radius: 6px; cursor: pointer; font-size: 1em;">🔗</button>
      </div>
    `;
  }).join("");

  // Обработчики для кнопок редактирования
  list.querySelectorAll(".player-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const playerId = btn.dataset.playerId;
      openRenamePlayerModal(playerId);
    });
  });

  // Обработчики для кнопок слияния
  list.querySelectorAll(".player-merge-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const playerId = btn.dataset.playerId;
      openMergePlayerModal(playerId);
    });
  });
}

// Открыть модальное окно переименования
function openRenamePlayerModal(playerId) {
  const player = currentEditingPlayers.get(playerId);
  if (!player) return;

  const modal = document.getElementById("modal-rename-player");
  const avatar = document.getElementById("rename-avatar");
  const input = document.getElementById("rename-input");
  const confirmBtn = document.getElementById("rename-confirm-btn");
  const cancelBtn = document.getElementById("rename-cancel-btn");

  // Заполнить данные
  avatar.textContent = player.name.charAt(0).toUpperCase();
  input.value = player.name;

  // Показать модал
  modal.style.display = "flex";

  // Автофокус
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);

  // Обработчик сохранения
  const handleSave = () => {
    const newName = input.value.trim();

    if (!newName) {
      showHint("❌ Имя не может быть пустым");
      return;
    }

    if (newName === player.name) {
      showHint("✨ Имя не изменилось");
      modal.style.display = "none";
      return;
    }

    renamePlayer(playerId, newName);
    showHint("✅ Игрок переименован");
    modal.style.display = "none";

    // Обновить список
    renderEditPlayersPage();

    // Обновить комнату если открыта
    const roomDetailsPage = document.getElementById("room-details");
    if (roomDetailsPage && roomDetailsPage.classList.contains("active")) {
      renderRoomPlayers();
    }
  };

  // ✅ ИСПРАВЛЕНИЕ: используем присвоение .onclick вместо addEventListener,
  // чтобы при повторном открытии модалки не накапливались старые обработчики
  // (иначе переименование срабатывало бы по несколько раз со старым playerId в замыкании)
  confirmBtn.onclick = handleSave;
  cancelBtn.onclick = () => modal.style.display = "none";
  input.onkeypress = (e) => {
    if (e.key === "Enter") handleSave();
  };
}

// Открыть модальное окно слияния
function openMergePlayerModal(primaryPlayerId) {
  const primaryPlayer = currentEditingPlayers.get(primaryPlayerId);
  if (!primaryPlayer) return;

  // ✅ Получить информацию о всех игроках, включая архивных (удалённые комнаты)
  const playerInfo = {};
  gameState.allPlayers.forEach(player => {
    playerInfo[player.id] = { name: player.name, avatar: player.avatar, score: player.score || 0 };
  });
  gameState.rooms.forEach(room => {
    room.players.forEach(player => {
      if (!playerInfo[player.id]) {
        playerInfo[player.id] = { name: player.name, avatar: player.avatar, score: 0 };
      }
      playerInfo[player.id].score = (playerInfo[player.id].score || 0) + (player.score || 0);
    });
  });

  const otherPlayers = Array.from(currentEditingPlayers.keys())
    .filter(id => id !== primaryPlayerId && playerInfo[id]);

  if (otherPlayers.length === 0) {
    showHint("❌ Нет других игроков для слияния");
    return;
  }

  const modal = document.getElementById("modal-merge-player");
  const avatarEl = document.getElementById("merge-primary-avatar");
  const nameEl = document.getElementById("merge-primary-name");
  const gridEl = document.getElementById("merge-players-grid");
  const cancelBtn = document.getElementById("merge-cancel-btn");

  // Заполнить заголовок
  avatarEl.textContent = primaryPlayer.name.charAt(0).toUpperCase();
  nameEl.textContent = sanitizeText(primaryPlayer.name);

  // Заполнить сетку
  gridEl.innerHTML = otherPlayers.map((id) => {
    const p = playerInfo[id];
    return `
      <button class="merge-player-card" data-merge-id="${id}" style="
        padding: 12px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        background: rgba(255,255,255,0.05);
        color: var(--text-color);
        font-family: inherit;
        width: 100%;
      ">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <img src="${p.avatar}" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover;">
          <div style="font-weight: 600; font-size: 0.95em;">${sanitizeText(p.name)}</div>
          <div style="font-size: 0.8em; opacity: 0.6;">${p.score} очков</div>
        </div>
      </button>
    `;
  }).join("");

  // Показать модал
  modal.style.display = "flex";

  // Удалить старые обработчики
  cancelBtn.onclick = null;
  gridEl.querySelectorAll(".merge-player-card").forEach(card => {
    card.onclick = null;
  });

  // Добавить новые обработчики
  cancelBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  gridEl.querySelectorAll(".merge-player-card").forEach(card => {
    card.addEventListener("click", () => {
      const mergeId = card.dataset.mergeId;
      mergePlayers(primaryPlayerId, mergeId);
      modal.style.display = "none";
      renderEditPlayersPage();
      showHint("✅ Игроки слиты");
    });

    // Hover эффект
    card.addEventListener("mouseenter", () => {
      card.style.background = "rgba(114, 40, 245, 0.2)";
      card.style.borderColor = "var(--primary-color)";
    });

    card.addEventListener("mouseleave", () => {
      card.style.background = "rgba(255,255,255,0.05)";
      card.style.borderColor = "rgba(255,255,255,0.1)";
    });
  });
}

// ✅ ИСПРАВЛЕНИЕ: раньше здесь использовался gameState.getPlayer(), который ищет
// игрока ТОЛЬКО в текущей открытой комнате (currentRoomIndex). Страница
// "Редактировать игроков" открывается из настроек, где текущая комната обычно
// не установлена (null) — из-за этого secondaryPlayer/primaryPlayer почти всегда
// были null, и очки/история при слиянии молча не переносились, а из живых комнат
// второй игрок просто исчезал без объединения данных.
function mergePlayers(primaryId, secondaryId) {
  // 1. В истории игр
  gameState.gameHistory.forEach(game => {
    game.players.forEach(p => {
      if (p.id === secondaryId) {
        p.id = primaryId;
      }
    });
  });

  // 2. Слить данные во всех комнатах, где встречается secondary
  gameState.rooms.forEach(room => {
    const secondaryIdx = room.players.findIndex(p => p.id === secondaryId);
    if (secondaryIdx === -1) return;

    const secondary = room.players[secondaryIdx];
    const primary = room.players.find(p => p.id === primaryId);

    if (primary) {
      // Оба игрока в одной комнате - объединяем очки и историю, удаляем secondary
      primary.score = (primary.score || 0) + (secondary.score || 0);
      primary.history = [...(primary.history || []), ...(secondary.history || [])];
      room.players.splice(secondaryIdx, 1);
    } else {
      // В этой комнате только secondary - просто "переименовываем" его в primary
      secondary.id = primaryId;
    }
  });

  // 3. Слить архивные записи (игроки из удалённых комнат)
  const secondaryArchiveIndex = gameState.allPlayers.findIndex(p => p.id === secondaryId);
  if (secondaryArchiveIndex !== -1) {
    const secondaryArchive = gameState.allPlayers[secondaryArchiveIndex];
    const primaryArchiveIndex = gameState.allPlayers.findIndex(p => p.id === primaryId);
    if (primaryArchiveIndex !== -1) {
      gameState.allPlayers[primaryArchiveIndex].score = (gameState.allPlayers[primaryArchiveIndex].score || 0) + (secondaryArchive.score || 0);
      gameState.allPlayers[primaryArchiveIndex].history = [...(gameState.allPlayers[primaryArchiveIndex].history || []), ...(secondaryArchive.history || [])];
    } else {
      gameState.allPlayers.push({ ...secondaryArchive, id: primaryId });
    }
    gameState.allPlayers.splice(gameState.allPlayers.findIndex(p => p.id === secondaryId), 1);
  }

  gameState.save();
  renderRooms();
  renderGameHistory();
  renderHomeStats();
}

function renamePlayer(playerId, newName) {
  // Обновить имя во всех комнатах
  gameState.rooms.forEach(room => {
    room.players.forEach(player => {
      if (player.id === playerId) {
        player.name = newName;
      }
    });
  });

  // Обновить имя в истории игр
  gameState.gameHistory.forEach(game => {
    game.players.forEach(p => {
      if (p.id === playerId) {
        p.name = newName;
      }
    });
  });

  // ✅ ИСПРАВЛЕНИЕ: обновить имя и в архиве, иначе после переименования игрока,
  // который есть только в удалённой комнате, архивная запись осталась бы со
  // старым именем и он "раздвоился" бы при следующем добавлении в комнату
  gameState.allPlayers.forEach(p => {
    if (p.id === playerId) {
      p.name = newName;
    }
  });

  gameState.save();

  // Если в статистике открыто - обновить статистику
  const modal = document.getElementById("modal-player-stats");
  if (modal && modal.style.display === "flex") {
    openPlayerStats(playerId);
  }

  renderRooms();
  renderGameHistory();
  renderHomeStats();  // Обновить статистику на главной
}

// ============================================================================
// ОЧИСТКА КЭША - УДАЛЕНО (использовать delete-all-btn вместо этого)
// ============================================================================

const confirmClearCache = document.getElementById("confirm-clear-cache");
if (confirmClearCache) {
  confirmClearCache.addEventListener("click", async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      window.location.reload(true);
    } catch (error) {
      console.error("❌ Ошибка очистки кэша:", error);
      showHint("⚠️ Ошибка при очистке кэша");
    }
  });
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

// Скрыть лоадер при загрузке
function hideLoader() {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.classList.add("hidden");
    setTimeout(() => {
      loader.style.display = "none";
    }, 600);
  }
}

// Скрываем лоадер после инициализации
setTimeout(hideLoader, 1000);
// window.addEventListener("load", hideLoader);

// Сортировка игроков
const sortToggle = document.getElementById("sort-toggle");
if (sortToggle) {
  sortToggle.addEventListener("change", (event) => {
    renderRoomPlayers();
  });
}

// Кнопка истории
const historyBtn = document.getElementById("history-btn");
if (historyBtn) {
  historyBtn.addEventListener("click", () => {
    navigateTo('history-page');
    renderGameHistory();
  });
}

// Режимы игры (радио батоны)
document.querySelectorAll('.mode-radio').forEach(label => {
  label.addEventListener('click', () => {
    document.querySelectorAll('.mode-radio').forEach(l => l.classList.remove('active'));
    label.classList.add('active');
  });
});

// Кнопки отмены в модалях
document.getElementById("cancel-add-player")?.addEventListener("click", () => {
  const modal = document.getElementById("modal-add-player");
  if (modal) modal.style.display = "none";
  // Сбросить состояние
  addPlayerModalState.selectedExistingPlayerIds.clear();
  addPlayerModalState.newPlayerNames.clear();
});

document.getElementById("cancel-add-points")?.addEventListener("click", () => {
  const modal = document.getElementById("modal-add-points");
  if (modal) modal.style.display = "none";
});

document.getElementById("reset-scores-cancel")?.addEventListener("click", () => {
  const modal = document.getElementById("modal-reset-scores");
  if (modal) modal.style.display = "none";
});

document.getElementById("delete-player-cancel")?.addEventListener("click", () => {
  const modal = document.getElementById("modal-delete-player");
  if (modal) modal.style.display = "none";
});

document.getElementById("delete-room-cancel")?.addEventListener("click", () => {
  const modal = document.getElementById("modal-delete-room");
  if (modal) modal.style.display = "none";
});

document.getElementById("cancel-clear-cache")?.addEventListener("click", () => {
  const modal = document.getElementById("clear-cache-modal");
  if (modal) modal.style.display = "none";
});

// Поиск в истории
document.getElementById("history-search")?.addEventListener("input", (e) => {
  renderGameHistory();
});

// Поиск в списке комнат
document.getElementById("rooms-search")?.addEventListener("input", (e) => {
  renderRooms();
});

// Первый игрок кнопка
document.getElementById("add-first-player-btn")?.addEventListener("click", () => {
  // Сбросить состояние
  addPlayerModalState.selectedExistingPlayerIds.clear();
  addPlayerModalState.newPlayerNames.clear();

  const modal = document.getElementById("modal-add-player");
  const input = document.getElementById("add-player-search");
  if (modal) {
    modal.style.display = "flex";
    renderAddPlayerList();
  }
  if (input) setTimeout(() => input.focus(), 50);
});

// Переменные для управления анимацией
let rollState = {
  rolling: false,
  rollTimer: null,
  rollRotation: 0,
  rollHighlightId: null,
  firstPickId: null,
  prevHighlightId: null // Для оптимизации updateRollHighlights
};

// Показывать/скрывать кнопку "Кто ходит первым?" в зависимости от количества игроков
function toggleWhoStartsButton() {
  const btn = document.getElementById("who-starts-btn");
  if (!btn) return;

  const room = gameState.getCurrentRoom();
  if (room && room.players.length >= 2) {
    btn.style.display = "flex";
    btn.disabled = false;
  } else {
    btn.style.display = "none";
  }
}

// Вызвать функцию при загрузке комнаты
if (gameState) {
  gameState.subscribe((event) => {
    if (event.type === 'ui-update') {
      toggleWhoStartsButton();
    }
  });
}

// Главная функция прокрутки списка игроков
function rollFirst() {
  if (rollState.rolling) return;

  const room = gameState.getCurrentRoom();
  if (!room || room.players.length < 2) {
    showHint("❌ Нужно минимум 2 игрока");
    return;
  }

  if (rollState.rollTimer) clearTimeout(rollState.rollTimer);

  // КЭШИРОВАНИЕ: получить все элементы один раз
  const btn = document.getElementById("who-starts-btn");
  const btnText = document.getElementById("who-starts-text");
  const icon = document.getElementById("who-starts-icon");
  const resultDiv = document.getElementById("roll-result");
  const resultName = document.getElementById("roll-result-name");
  const resultAvatar = document.getElementById("roll-result-avatar");

  btn.disabled = true;
  if (btnText) btnText.textContent = "Крутим...";
  if (resultDiv) resultDiv.style.display = "none";

  const players = room.players;
  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % players.length;
  const winner = players[randomIndex];
  const totalSteps = 14 + players.length * 2;
  const playerCount = players.length;
  let step = 0;

  rollState.rolling = true;
  rollState.firstPickId = null;
  rollState.rollHighlightId = players[0].id;
  updateRollHighlights();

  const tick = () => {
    step++;
    const idx = step % playerCount;
    rollState.rollHighlightId = players[idx].id;

    // ОПТИМИЗАЦИЯ: обновить только один раз за шаг
    updateRollHighlights();

    // Повернуть иконку (только если существует)
    if (icon) {
      rollState.rollRotation += 90;
      icon.style.transform = `rotate(${rollState.rollRotation}deg)`;
    }

    if (step >= totalSteps) {
      // Конец анимации
      rollState.rolling = false;
      rollState.firstPickId = winner.id;
      rollState.rollHighlightId = null;
      updateRollHighlights();

      // Показать результат (кэшированные элементы)
      if (resultName) resultName.textContent = sanitizeText(winner.name);
      if (resultAvatar && winner.avatar) {
        resultAvatar.style.backgroundImage = `url('${winner.avatar}')`;
      }
      if (resultDiv) resultDiv.style.display = "block";
      if (btnText) btnText.textContent = "Кто ходит первым?";
      btn.disabled = false;

      // Автоскрытие
      rollState.rollTimer = setTimeout(() => {
        if (resultDiv) resultDiv.style.display = "none";
        rollState.firstPickId = null;
        updateRollHighlights();
      }, 4000);

      return;
    }

    // ОПТИМИЗАЦИЯ: более плавная анимация (35-250ms вместо 55-315ms)
    const progress = step / totalSteps;
    const delay = 35 + progress * progress * 215;
    rollState.rollTimer = setTimeout(tick, delay);
  };

  rollState.rollTimer = setTimeout(tick, 60);
}

// Обновить подсвечивание игроков (ОПТИМИЗИРОВАНО: O(1) вместо O(n))
function updateRollHighlights() {
  // Удалить старую подсветку
  if (rollState.prevHighlightId) {
    const prevRow = document.querySelector(`[data-player-id="${rollState.prevHighlightId}"]`);
    if (prevRow) prevRow.classList.remove("roll-highlight", "roll-winner");
  }

  // Если во время анимации - подсветить текущего
  if (rollState.rolling && rollState.rollHighlightId) {
    const row = document.querySelector(`[data-player-id="${rollState.rollHighlightId}"]`);
    if (row) {
      row.classList.remove("roll-winner");
      row.classList.add("roll-highlight");
    }
    rollState.prevHighlightId = rollState.rollHighlightId;
  }
  // Если остановилась - подсветить победителя
  else if (!rollState.rolling && rollState.firstPickId) {
    const row = document.querySelector(`[data-player-id="${rollState.firstPickId}"]`);
    if (row) {
      row.classList.remove("roll-highlight");
      row.classList.add("roll-winner");
    }
    rollState.prevHighlightId = rollState.firstPickId;
  }
  // Очистить
  else {
    rollState.prevHighlightId = null;
  }
}


// ✅ УДАЛЕНО: обработчик перемещен вниз (было двойное определение)
// document.getElementById("who-starts-btn")?.addEventListener("click", rollFirst);

// Обработчик закрытия результата
document.getElementById("roll-result-close")?.addEventListener("click", () => {
  const resultDiv = document.getElementById("roll-result");
  if (resultDiv) resultDiv.style.display = "none";
  rollState.firstPickId = null;
  updateRollHighlights();
});

// Очистка при выходе из комнаты
const originalNavigateTo = window.navigateTo || function() {};
window.navigateTo = function(pageId) {
  if (rollState.rollTimer) {
    clearTimeout(rollState.rollTimer);
    rollState.rolling = false;
  }
  return originalNavigateTo(pageId);
};

// Кастомный селектор темы
const customSelect = document.querySelector(".custom-select");
if (customSelect) {
  const customSelectTrigger = customSelect.querySelector(".custom-select-trigger");
  const customOptions = customSelect.querySelector(".custom-options");
  const hiddenSelect = document.getElementById("theme-selector");
  const options = customOptions?.querySelectorAll(".custom-option") || [];

  function setActiveOption(value) {
    options.forEach((opt) => opt.classList.remove("active"));
    const matchedOption = [...options].find((opt) => opt.getAttribute("data-value") === value);
    if (matchedOption) {
      matchedOption.classList.add("active");
      if (customSelectTrigger) {
        const span = customSelectTrigger.querySelector("span");
        if (span) span.textContent = matchedOption.textContent;
      }
      if (hiddenSelect) hiddenSelect.value = value;
    }
  }

  if (customSelectTrigger) {
    customSelectTrigger.addEventListener("click", () => {
      customSelect.classList.toggle("open");
      if (customSelect.classList.contains("open") && hiddenSelect) {
        setActiveOption(hiddenSelect.value);
      }
    });
  }

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
}

// ===== ИНИЦИАЛИЗАЦИЯ AKULKA CAROUSEL =====
function initializeAkulkaCarousel() {
  const carousel = document.getElementById("akulka-carousel");
  if (!carousel) return;

  const projects = [
    { name: 'Calm Check', version: 'v1.3', icon: 'icons/CalmCheck-icon.png', link: 'https://calm-check-nine.vercel.app/', description: 'Спокойные сценарные проверки для снятия неопределённости' },
    { name: 'BudgetIt', version: 'v4.0.1', icon: 'icons/budgetit-icon.png', link: 'https://budgetit.app/', description: 'Удобный учёт финансов с аналитикой' },
    { name: 'Мигри', version: 'v1.2', icon: 'icons/migry-icon.png', link: 'https://migry-bice.vercel.app/index.html', description: 'Трекер головной боли с аналитикой для врача' },
    { name: 'Ludomania', version: 'beta', icon: 'icons/ludomania-icon.png', link: 'https://t.me/LUdomania_app_bot?start=start', description: 'Безопасные азартные игры' }
  ];

  carousel.innerHTML = projects.map((project, i) => {
    const isLink = project.link ? 'a' : 'div';
    const attrs = project.link ? `href="${project.link}" target="_blank"` : '';
    return `<${isLink} ${attrs} class="akulka-item glass-card" style="text-decoration: none; color: inherit;">
      <img src="${project.icon}" alt="${project.name}" class="akulka-icon" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect fill=%22%23ccc%22 width=%2264%22 height=%2264%22/%3E%3C/svg%3E'">
      <div style="font-weight: 600; font-size: 0.95em; margin-top: 8px;">${project.name}</div>
      <div style="font-size: 0.75em; opacity: 0.6; margin-top: 4px;">${project.version}</div>
      <div style="font-size: 0.8em; opacity: 0.7; margin-top: 6px; line-height: 1.3;">${project.description || ''}</div>
    </${isLink}>`;
  }).join("");
}

// ===== ИНИЦИАЛИЗАЦИЯ THEMES CAROUSEL =====
function initializeThemesCarousel() {
  const carousel = document.getElementById("themes-carousel");
  if (!carousel) return;

  const themes = [
    { value: 'default', name: 'Default', primary: '#47fdad', secondary: '#fbfbfc', accent: '#7228F5', bg: '#fbfbfc', type: 'light' },
    { value: 'default-black', name: 'Default Black', primary: '#47fdad', secondary: '#fbfbfc', accent: '#A0FF00', bg: '#000000', type: 'dark' },
    { value: 'default-violet', name: 'Black Violet Pulse', primary: '#7228F5', secondary: '#A0FF00', accent: '#47fdad', bg: '#1a0033', type: 'dark' },
    { value: 'default-white', name: 'Old White', primary: '#7228F5', secondary: '#A0FF00', accent: '#FF6B6B', bg: '#ffffff', type: 'light' },
    { value: 'onyx', name: 'Onyx', primary: '#5865f2', secondary: '#ffffff', accent: '#cccccc', bg: '#1a1a1a', type: 'dark' },
    { value: 'space-explorer', name: 'Space Explorer', primary: '#001F3F', secondary: '#A6A6A6', accent: '#FFD700', bg: '#ffffff', type: 'light' },
    { value: 'ocean-depths', name: 'Ocean Depths', primary: '#1B4D3E', secondary: '#56C8D8', accent: '#FFB700', bg: '#09080d', type: 'dark' },
    { value: 'neon-experiment', name: 'Neon Experiment', primary: '#191bdf', secondary: '#fe6807', accent: '#00FF00', bg: '#09080d', type: 'dark' },
    { value: 'midnight-meon', name: 'Midnight Neon', primary: '#7231ff', secondary: '#ffc01d', accent: '#00FF88', bg: '#07080a', type: 'dark' },
    { value: 'mystic-pastel', name: 'Mystic Pastel', primary: '#c68dfe', secondary: '#c9e957', accent: '#FF88DD', bg: '#303843', type: 'dark' },
    { value: 'forest-harmony', name: 'Forest Harmony', primary: '#2d5016', secondary: '#7bc962', accent: '#FFD700', bg: '#1a3a1a', type: 'dark' },
    { value: 'new-year', name: 'New Year 2025', primary: '#c41e3a', secondary: '#ffd700', accent: '#00FF00', bg: '#0a0a0a', type: 'dark' },
    { value: 'golden-hour', name: 'Golden Hour', primary: '#FFB74D', secondary: '#FF8A65', accent: '#FFC107', bg: '#FFF3E0', type: 'light' },
    { value: 'cyberpunk-neon', name: 'Cyberpunk Neon', primary: '#FF007F', secondary: '#00FFFF', accent: '#FFD700', bg: '#121212', type: 'dark' },
    { value: 'spring-blossom', name: 'Spring Blossom', primary: '#FFB7C5', secondary: '#9FE2BF', accent: '#FFD700', bg: '#FFFAF0', type: 'light' },
    { value: 'autumn-leaves', name: 'Autumn Leaves', primary: '#8B4513', secondary: '#FFA500', accent: '#FF6347', bg: '#FFF5EE', type: 'light' },
    { value: 'galaxy-dreams', name: 'Galaxy Dreams', primary: '#2C3E50', secondary: '#8E44AD', accent: '#FF6EC7', bg: '#1A1A2E', type: 'dark' },
    { value: 'minimal-elegance', name: 'Minimal Elegance', primary: '#000000', secondary: '#FFFFFF', accent: '#CCCCCC', bg: '#F5F5F5', type: 'light' },
    { value: 'tropical-sunset', name: 'Tropical Sunset', primary: '#FF6347', secondary: '#FFD700', accent: '#FF69B4', bg: '#FFA07A', type: 'dark' }
  ];

  const currentTheme = localStorage.getItem("theme") || "default";
  carousel.innerHTML = themes.map(theme => `
    <div class="theme-item ${theme.value === currentTheme ? 'active' : ''}">
      <div class="theme-preview" style="background: ${theme.bg};" onclick="applyTheme('${theme.value}'); updateThemeCarousel('${theme.value}');">
        <!-- Mini header -->
        <div style="width: 100%; height: 10px; background: ${theme.primary}; border-radius: 3px 3px 0 0;"></div>
        <!-- Mini content -->
        <div style="flex: 1; padding: 4px; display: flex; flex-direction: column; gap: 3px; overflow: hidden;">
          <!-- Bar 1 -->
          <div style="height: 3px; background: ${theme.primary}; border-radius: 1px; width: 70%;"></div>
          <!-- Bar 2 -->
          <div style="height: 2px; background: ${theme.secondary}; border-radius: 1px; width: 80%;"></div>
          <!-- Bar 3 -->
          <div style="height: 2px; background: ${theme.accent}; border-radius: 1px; width: 60%;"></div>
          <!-- Dots -->
          <div style="display: flex; gap: 3px; margin-top: 3px;">
            <div style="width: 4px; height: 4px; background: ${theme.primary}; border-radius: 50%;"></div>
            <div style="width: 4px; height: 4px; background: ${theme.secondary}; border-radius: 50%;"></div>
            <div style="width: 4px; height: 4px; background: ${theme.accent}; border-radius: 50%;"></div>
          </div>
        </div>
      </div>
      <div class="theme-item-name">${theme.name}</div>
    </div>
  `).join("");
}

function updateThemeCarousel(activeTheme) {
  document.querySelectorAll(".theme-item").forEach(item => item.classList.remove("active"));
  const themes = ['default', 'default-black', 'default-violet', 'default-white', 'onyx', 'space-explorer', 'ocean-depths', 'neon-experiment', 'midnight-meon', 'mystic-pastel', 'forest-harmony', 'new-year', 'golden-hour', 'cyberpunk-neon', 'spring-blossom', 'autumn-leaves', 'galaxy-dreams', 'minimal-elegance', 'tropical-sunset'];
  const index = themes.indexOf(activeTheme);
  if (index !== -1) {
    document.querySelectorAll(".theme-item")[index].classList.add("active");
  }
}

// OLED режим - УДАЛЕНО

// Статистика
document.getElementById("stats-toggle")?.addEventListener("change", (e) => {
  localStorage.setItem("show-stats", e.target.checked);
});

// Экспорт данных
document.getElementById("export-data-btn")?.addEventListener("click", () => {
  const data = JSON.stringify(gameState, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trackit-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showHint("✅ Данные экспортированы");
});

// Импорт данных
document.getElementById("import-data-btn")?.addEventListener("click", () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);

        // Валидация структуры данных
        if (!imported || typeof imported !== 'object') {
          throw new Error("Invalid data format");
        }
        if (!Array.isArray(imported.rooms) || !Array.isArray(imported.gameHistory)) {
          throw new Error("Missing required data: rooms or gameHistory");
        }

        // ✅ ИСПРАВЛЕНИЕ: Присвоить только данные, сохранить методы класса
        gameState.rooms = imported.rooms || [];
        gameState.gameHistory = imported.gameHistory || [];
        gameState.recentPlayers = imported.recentPlayers || [];
        gameState.allPlayers = imported.allPlayers || []; // ✅ Импортируем архив тоже, иначе он бы обнулился
        gameState.currentRoomIndex = null; // Сброс текущей комнаты

        // ОЧЕНЬ ВАЖНО: Очистить флаги миграции чтобы они пересчитались с импортированными данными
        console.log("🔄 Очистка флагов миграции для переиспользования...");
        localStorage.removeItem("_roomsMigrated");
        localStorage.removeItem("_playersMerged");
        localStorage.removeItem("_historyMigrated");
        localStorage.removeItem("_historyConvertedToMultiLosers");
        localStorage.removeItem("_historyPlayersMerged");
        localStorage.removeItem("_historyConvertedToMultiLosers");

        gameState.save();
        showHint("✅ Данные импортированы. Перезагрузка...");
        setTimeout(() => location.reload(), 1000);
      } catch (error) {
        console.error("❌ Ошибка импорта:", error);
        showHint("❌ Ошибка импорта: " + error.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

// Удалить всё
document.getElementById("delete-all-btn")?.addEventListener("click", () => {
  const modal = document.getElementById("modal-delete-all-data");
  if (modal) modal.style.display = "flex";
});

document.getElementById("delete-all-confirm")?.addEventListener("click", () => {
  localStorage.clear();
  location.reload();
});

document.getElementById("delete-all-cancel")?.addEventListener("click", () => {
  const modal = document.getElementById("modal-delete-all-data");
  if (modal) modal.style.display = "none";
});

// ============================================================================
// ✅ Старая функция selectWhoStarts() УДАЛЕНА - используется новая rollFirst() с лучшей анимацией
// (Была проблема с двойными обработчиками на кнопку)

// ✅ Обработчик кнопки "Кто ходит первым?" (новая красивая анимация)
document.getElementById("who-starts-btn")?.addEventListener("click", rollFirst);

// ✅ УДАЛЕНО: мёртвый обработчик для #who-starts-close-btn / #who-starts-result —
// в текущей разметке этих элементов нет (результат рендерится в #roll-result,
// закрывается через #roll-result-close, обработчик для него уже есть выше).
// Старый код к тому же обращался к необъявленной переменной whoStartsHideTimeout.

// ✅ Обработчик кнопки избранного
document.getElementById("favorite-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleFavorite();
});

// ✅ Обработчик кнопки "Назад" из комнаты
document.getElementById("back-to-rooms-btn")?.addEventListener("click", () => {
  // Очистить текущую комнату
  gameState.currentRoomIndex = null;
  // Вернуться к списку комнат (хедер и отступы восстановятся автоматически в navigateTo)
  navigateTo('room-list');
  renderRooms(); // Обновить список
});

// Инициализируем при загрузке
document.addEventListener("DOMContentLoaded", () => {
  initializeAkulkaCarousel();
  initializeThemesCarousel();
  const statsEnabled = localStorage.getItem("show-stats") !== "false";
  if (document.getElementById("stats-toggle")) {
    document.getElementById("stats-toggle").checked = statsEnabled;
  }
});

// Регистрируем Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js', { scope: '/' })
    .catch(() => {});
}