(() => {
  const $ = (s) => document.querySelector(s);
  const arena = $('.arena');
  const unitsLayer = $('#units');
  const cards = [...document.querySelectorAll('.cards button')];

  const UNIT_STATS = {
    'Royal Guard': {
      icon: '🛡️',
      cost: 3,
      hp: 190,
      atk: 14,
      range: 34,
      speed: 34,
      cooldown: 1.15,
      defense: 0.45,
      isTank: true
    },
    'Archer': {
      icon: '🏹',
      cost: 4,
      hp: 95,
      atk: 20,
      range: 105,
      speed: 48,
      cooldown: 1.0,
      defense: 0.05,
      isTank: false
    },
    'Knight': {
      icon: '⚔️',
      cost: 5,
      hp: 155,
      atk: 28,
      range: 38,
      speed: 56,
      cooldown: 0.9,
      defense: 0.15,
      isTank: false
    }
  };

  let state = {
    playerEnergy: 5,
    aiEnergy: 5,
    playerHp: 100,
    enemyHp: 100,
    ended: false,
    units: [],
    nextId: 1,
    aiTimer: 1.4,
    lastTime: performance.now(),
    energyAcc: 0
  };

  function getArenaSize() {
    return {
      width: arena ? arena.clientWidth : 680,
      height: arena ? arena.clientHeight : 350
    };
  }

  function getTowerPos(team) {
    const { width, height } = getArenaSize();
    return {
      x: width * 0.5,
      y: team === 'player' ? height - 48 : 48
    };
  }

  function spawnUnit(team, unitName, customX = null) {
    const base = UNIT_STATS[unitName];
    if (!base || state.ended) return null;

    const { width, height } = getArenaSize();
    const x =
      customX !== null
        ? Math.max(36, Math.min(width - 36, customX))
        : width * (0.22 + Math.random() * 0.56);

    const y =
      team === 'player'
        ? height * (0.64 + Math.random() * 0.14)
        : height * (0.22 + Math.random() * 0.14);

    const el = document.createElement('div');
    el.className = `battle-unit team-${team}${base.isTank ? ' defending' : ''}`;
    el.innerHTML = `
      <div class="hp-mini"><span></span></div>
      <div class="sprite">${base.icon}</div>
    `;
    unitsLayer.appendChild(el);

    const unit = {
      id: state.nextId++,
      team,
      name: unitName,
      icon: base.icon,
      x,
      y,
      hp: base.hp,
      maxHp: base.hp,
      atk: base.atk,
      range: base.range,
      speed: base.speed,
      cooldown: base.cooldown,
      attackTimer: 0.25,
      defense: base.defense,
      isTank: base.isTank,
      el,
      hpBar: el.querySelector('.hp-mini span')
    };

    state.units.push(unit);
    syncUnitDom(unit);
    return unit;
  }

  function syncUnitDom(u) {
    u.el.style.transform = `translate(${u.x.toFixed(1)}px, ${u.y.toFixed(1)}px) translate(-50%, -50%)`;
    const pct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
    u.hpBar.style.width = `${pct}%`;
  }

  function findTarget(u) {
    let bestEnemy = null;
    let bestDist = Infinity;

    for (const other of state.units) {
      if (other.team === u.team || other.hp <= 0) continue;
      const d = Math.hypot(other.x - u.x, other.y - u.y);
      if (d < bestDist) {
        bestDist = d;
        bestEnemy = other;
      }
    }

    const enemyTeam = u.team === 'player' ? 'ai' : 'player';
    const towerPos = getTowerPos(enemyTeam);
    const towerDist = Math.hypot(towerPos.x - u.x, towerPos.y - u.y);

    if (bestEnemy && bestDist <= u.range + 45) {
      return { type: 'unit', unit: bestEnemy, x: bestEnemy.x, y: bestEnemy.y, dist: bestDist };
    }

    if (towerDist <= u.range + 22) {
      return { type: 'tower', team: enemyTeam, x: towerPos.x, y: towerPos.y, dist: towerDist };
    }

    if (bestEnemy && bestDist < towerDist * 0.75) {
      return { type: 'unit', unit: bestEnemy, x: bestEnemy.x, y: bestEnemy.y, dist: bestDist };
    }

    return { type: 'tower', team: enemyTeam, x: towerPos.x, y: towerPos.y, dist: towerDist };
  }

  function applyDamageToUnit(targetUnit, rawDamage) {
    const mitigated = Math.max(1, rawDamage * (1 - (targetUnit.defense || 0)));
    targetUnit.hp -= mitigated;
    targetUnit.el.classList.remove('hit');
    void targetUnit.el.offsetWidth;
    targetUnit.el.classList.add('hit');
    syncUnitDom(targetUnit);
  }

  function applyDamageToTower(enemyTeam, rawDamage) {
    const towerDmg = Math.max(1, Math.round(rawDamage * 0.25));
    if (enemyTeam === 'ai') {
      state.enemyHp = Math.max(0, state.enemyHp - towerDmg);
    } else {
      state.playerHp = Math.max(0, state.playerHp - towerDmg);
    }
  }

  function updateAI(dt) {
    state.aiTimer -= dt;
    if (state.aiTimer > 0) return;

    const affordable = Object.entries(UNIT_STATS)
      .filter(([, cfg]) => cfg.cost <= state.aiEnergy)
      .map(([name]) => name);

    if (!affordable.length) {
      state.aiTimer = 1.0;
      return;
    }

    const playerUnits = state.units.filter((u) => u.team === 'player');
    const aiUnits = state.units.filter((u) => u.team === 'ai');

    let chosen = affordable[Math.floor(Math.random() * affordable.length)];

    if (playerUnits.length > aiUnits.length + 1 && affordable.includes('Royal Guard')) {
      chosen = 'Royal Guard';
    } else if (playerUnits.some((u) => u.isTank) && affordable.includes('Archer')) {
      chosen = 'Archer';
    } else if (state.aiEnergy >= 7 && affordable.includes('Knight')) {
      chosen = 'Knight';
    }

    state.aiEnergy -= UNIT_STATS[chosen].cost;
    const focusX = playerUnits.length ? playerUnits[0].x : null;
    spawnUnit('ai', chosen, focusX);

    state.aiTimer = 2.1 + Math.random() * 1.4;
  }

  function checkMatchEnd() {
    if (state.ended) return;

    if (state.enemyHp <= 0 && state.playerHp <= 0) {
      state.ended = true;
      $('#status').textContent = 'DRAW';
      $('#message').textContent = 'DRAW! Both kingdoms fell in battle.';
    } else if (state.enemyHp <= 0) {
      state.ended = true;
      $('#status').textContent = 'VICTORY';
      $('#message').textContent = 'VICTORY! Rival tower destroyed and the crown is yours.';
    } else if (state.playerHp <= 0) {
      state.ended = true;
      $('#status').textContent = 'DEFEAT';
      $('#message').textContent = 'DEFEAT! Your tower fell to the rival army.';
    }
  }

  function update(dt) {
    if (state.ended) return;

    state.energyAcc += dt;
    if (state.energyAcc >= 1.8) {
      state.energyAcc -= 1.8;
      if (state.playerEnergy < 10) state.playerEnergy++;
      if (state.aiEnergy < 10) state.aiEnergy++;
    }

    updateAI(dt);

    for (const u of state.units) {
      if (u.hp <= 0) continue;

      u.attackTimer = Math.max(0, u.attackTimer - dt);
      const target = findTarget(u);

      if (target.dist > u.range) {
        u.el.classList.remove('attacking');
        const dx = target.x - u.x;
        const dy = target.y - u.y;
        const len = Math.hypot(dx, dy) || 1;
        u.x += (dx / len) * u.speed * dt;
        u.y += (dy / len) * u.speed * dt;
      } else {
        u.el.classList.add('attacking');
        if (u.attackTimer <= 0) {
          u.attackTimer = u.cooldown;
          if (target.type === 'unit' && target.unit.hp > 0) {
            applyDamageToUnit(target.unit, u.atk);
          } else if (target.type === 'tower') {
            applyDamageToTower(target.team, u.atk);
          }
        }
      }

      syncUnitDom(u);
    }

    state.units = state.units.filter((u) => {
      if (u.hp <= 0) {
        u.el.remove();
        return false;
      }
      return true;
    });

    checkMatchEnd();
  }

  function renderHud() {
    $('#energy').textContent = state.playerEnergy;
    $('#bar').style.width = `${state.playerEnergy * 10}%`;
    $('#enemyHp').textContent = state.enemyHp;
    $('#playerHp').textContent = state.playerHp;

    cards.forEach((btn) => {
      const cost = +btn.dataset.cost;
      btn.disabled = state.ended || state.playerEnergy < cost;
    });
  }

  cards.forEach((btn) => {
    btn.onclick = () => {
      const name = btn.dataset.name;
      const cost = +btn.dataset.cost;
      if (state.ended || state.playerEnergy < cost) return;

      state.playerEnergy -= cost;
      spawnUnit('player', name);
      $('#message').textContent = `${name} deployed! Marching into battle.`;
      renderHud();
    };
  });

  $('#reset').onclick = () => {
    state.units.forEach((u) => u.el.remove());
    state = {
      playerEnergy: 5,
      aiEnergy: 5,
      playerHp: 100,
      enemyHp: 100,
      ended: false,
      units: [],
      nextId: 1,
      aiTimer: 1.4,
      lastTime: performance.now(),
      energyAcc: 0
    };
    $('#status').textContent = 'AI BATTLE';
    $('#message').textContent = 'Deploy troops to fight the AI rival.';
    renderHud();
  };

  function loop(now) {
    const dt = Math.min(0.05, (now - state.lastTime) / 1000);
    state.lastTime = now;

    update(dt);
    renderHud();
    requestAnimationFrame(loop);
  }

  $('#status').textContent = 'AI BATTLE';
  $('#message').textContent = 'Deploy troops to fight the AI rival.';
  renderHud();
  requestAnimationFrame(loop);
})();
