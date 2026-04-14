// const Matter = require('matter-js');


const ONLINE_LB = {
	url:     'https://lbindgmnfbpkbjqddyxu.supabase.co',   // 例: 'https://xyzxyz.supabase.co'
	anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiaW5kZ21uZmJwa2JqcWRkeXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNjcyMjgsImV4cCI6MjA5MTY0MzIyOH0.cM61fRkaFhZ7fywD4U1mIC4wclbgUe908XNdShMBG6w',   // Project Settings → API → anon public
	get enabled() { return !!(this.url && this.anonKey); }
};

function mulberry32(a) {
	return function() {
		let t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

const rand = mulberry32(Date.now());

const {
	Engine, Render, Runner, Composites, Common, MouseConstraint, Mouse,
	Composite, Bodies, Events,
} = Matter;

const wallPad = 64;
const loseHeight = 84;
const statusBarHeight = 48;
const previewBallHeight = 32;
// 壁・地面用 (バウンドなし)
const friction = {
	friction: 0.02,
	frictionStatic: 0.005,
	frictionAir: 0.003,
	restitution: 0,
};

// フルーツ用 (フルーツ同士は弾む、地面は別途イベントで制御)
const fruitPhysics = {
	friction: 0.02,
	frictionStatic: 0.005,
	frictionAir: 0.003,
	restitution: 0.2,
};

const GameStates = {
	MENU: 0,
	READY: 1,
	DROP: 2,
	LOSE: 3,
	SHOP: 4,    // roguelike: between antes
};

// ============================================================
// ROGUELIKE: RELIC DEFINITIONS  (v12 — 25 relics)
// ============================================================
const RELIC_DEFS = [
	// ── COMMON (5) ──────────────────────────────────────────
	{ id: 'coin_magnet',   name: 'コイン磁石',    emoji: '🧲', rarity: 'common',    cost: 10,
	  desc: '合体するたびにコイン+2' },
	{ id: 'triple_merge',  name: '三連星',         emoji: '🌟', rarity: 'common',    cost: 10,
	  desc: 'サイズ3以下の合体でコイン+3' },
	{ id: 'size_down_pts', name: '精密打撃',       emoji: '🎯', rarity: 'common',    cost: 12,
	  desc: 'サイズ2の合体で+15pts追加' },
	{ id: 'lucky_cat',     name: '幸運の猫',       emoji: '🐱', rarity: 'common',    cost: 12,
	  desc: '次フルーツが同じサイズになる確率+60%' },
	{ id: 'moon',          name: '月の加護',       emoji: '🌙', rarity: 'common',    cost: 15,
	  desc: '合体するたびに+5pts追加' },
	// ── UNCOMMON (6) ────────────────────────────────────────
	{ id: 'big_score',     name: '大金持ち',       emoji: '💰', rarity: 'uncommon',  cost: 30,
	  desc: 'サイズ5以上の合体で+25pts追加' },
	{ id: 'combo_master',  name: 'コンボマスター',  emoji: '🔥', rarity: 'uncommon',  cost: 35,
	  desc: 'コンボボーナス×2' },
	{ id: 'size_up',       name: 'サイズの恵み',   emoji: '⬆️', rarity: 'uncommon',  cost: 40,
	  desc: '30%の確率でフルーツが1サイズ大きくなる' },
	{ id: 'rebirth',       name: '再誕',            emoji: '♻️', rarity: 'uncommon',  cost: 45,
	  desc: '合体後15%の確率でサイズ1が出現' },
	{ id: 'ante_bonus',    name: 'フロアボーナス', emoji: '🎁', rarity: 'uncommon',  cost: 30,
	  desc: 'フロア開始時にスコア+50pt' },
	{ id: 'diamond',       name: 'ダイヤの心',     emoji: '💎', rarity: 'uncommon',  cost: 50,
	  desc: '合体するたびに+10pts追加' },
	// ── RARE (5) ────────────────────────────────────────────
	{ id: 'golden7',       name: '黄金の7',        emoji: '⑦',  rarity: 'rare',      cost: 80,
	  desc: 'サイズ7以上の合体スコア×3' },
	{ id: 'gravity_heavy', name: '重力の申し子',    emoji: '🌍', rarity: 'rare',      cost: 85,
	  desc: '重力↑、その分合体ごとにコイン+1追加' },
	{ id: 'lightning',     name: '雷光',            emoji: '⚡', rarity: 'rare',      cost: 90,
	  desc: 'サイズ3〜4の合体でコイン+4' },
	{ id: 'shield',        name: '鉄壁の盾',        emoji: '🛡️', rarity: 'rare',      cost: 100,
	  desc: 'ゲームオーバーを1回防ぐ（シールド+1）' },
	{ id: 'crown',         name: '王冠',            emoji: '👑', rarity: 'rare',      cost: 85,
	  desc: 'このフロアのスコア目標を20%下げる' },
	// ── EPIC (5) ────────────────────────────────────────────
	{ id: 'trident',       name: '三叉の槍',        emoji: '🔱', rarity: 'epic',      cost: 200,
	  desc: 'サイズ2以上の合体でコイン+5' },
	{ id: 'rainbow',       name: 'レインボー',      emoji: '🌈', rarity: 'epic',      cost: 160,
	  desc: '20%の確率で合体スコア×3' },
	{ id: 'meteor',        name: '流星',            emoji: '☄️', rarity: 'epic',      cost: 170,
	  desc: '5回合体ごとにサイズ1のフルーツが降ってくる' },
	{ id: 'butterfly',     name: '蝶の変化',        emoji: '🦋', rarity: 'epic',      cost: 180,
	  desc: 'ドロップするフルーツがサイズ1〜5を順番に循環する' },
	{ id: 'asteroid',      name: '小惑星',          emoji: '🪨', rarity: 'epic',      cost: 160,
	  desc: 'フロア開始時にサイズ1のフルーツを3個出現させる' },
	// ── LEGENDARY (4) ───────────────────────────────────────
	{ id: 'alchemist',     name: '錬金術師',        emoji: '⚗️', rarity: 'legendary', cost: 320,
	  desc: 'フロア終了時、所持コインを全てスコアに変換(1コイン=5pt)' },
	{ id: 'talisman',      name: 'タリスマン',      emoji: '🧿', rarity: 'legendary', cost: 350,
	  desc: 'シールド+3（鉄壁の盾と重複可）' },
	{ id: 'cosmos',        name: 'コスモス',        emoji: '🌌', rarity: 'legendary', cost: 420,
	  desc: '全ての合体スコア×2' },
	{ id: 'dragon',        name: '竜神の怒り',      emoji: '🐉', rarity: 'legendary', cost: 480,
	  desc: 'コンボボーナス×5（コンボマスターと重複時×10）' },
];

// Minimum zone required to see each rarity in the shop
const MIN_ZONE_FOR_RARITY = { common: 1, uncommon: 1, rare: 1, epic: 2, legendary: 3 };

// ============================================================
// BOSS RELIC DEFINITIONS
// ============================================================
const BOSS_RELIC_DEFS = {
	rare: [
		{ id: 'boss_double_drop', name: '双子の果実', emoji: '👯', rarity: 'boss_rare',
		  desc: '1回のドロップで2個同時にフルーツを落とせる' },
		{ id: 'boss_size7_clear', name: '七星破壊', emoji: '💫', rarity: 'boss_rare',
		  desc: 'サイズ7以上の合体でサイズ0のフルーツを全削除' },
		{ id: 'boss_square', name: '方陣変化', emoji: '⬜', rarity: 'boss_rare',
		  desc: '新しくドロップするフルーツが四角形になる（物理判定も四角）' },
		{ id: 'boss_overtime', name: '最後の抵抗', emoji: '⏳', rarity: 'boss_rare',
		  desc: 'ゲームオーバーライン超えても5秒耐えられる（1回限り）' },
	],
	epic: [
		{ id: 'boss_shrink', name: '次元圧縮', emoji: '🔬', rarity: 'boss_epic',
		  desc: '全フルーツのサイズが0.8倍に縮小。より多く詰め込める' },
		{ id: 'boss_skip', name: '進化跳躍', emoji: '⚡', rarity: 'boss_epic',
		  desc: '15%の確率で合体時に進化を1段階スキップ' },
		{ id: 'boss_reroll', name: '果実交換', emoji: '🔄', rarity: 'boss_epic',
		  desc: '次のフルーツをリロールできる（無制限）' },
		{ id: 'boss_blackhole', name: 'ブラックホール', emoji: '🕳️', rarity: 'boss_epic',
		  desc: '最大サイズ同士の合体で盤面の全フルーツを消去する' },
	],
	legendary: [
		{ id: 'boss_bomb', name: '爆破の祝福', emoji: '💣', rarity: 'boss_legendary',
		  desc: '15%の確率でタップ爆破フルーツが降ってくる。タップで周囲を消去' },
		{ id: 'boss_reroll_stock', name: '果実の宝庫', emoji: '📦', rarity: 'boss_legendary',
		  desc: '次のフルーツをリロールできる（3回ストック）' },
		{ id: 'boss_instant_max', name: '極限消滅', emoji: '☄️', rarity: 'boss_legendary',
		  desc: '最大サイズのフルーツが生成された瞬間に消滅してスコアを獲得' },
	],
};

// ============================================================
// SYNERGY DEFINITIONS
// ============================================================
const SYNERGY_DEFS = [
	{ relics: ['coin_magnet', 'trident'], name: '硬貨の嵐', emoji: '🌪️', desc: '合体ごとにコイン+1追加', effect: 'extra_coins', bonus: 1 },
	{ relics: ['combo_master', 'dragon'], name: '竜の怒り覚醒', emoji: '🐲', desc: 'コンボボーナス×2', effect: 'combo_x2' },
	{ relics: ['cosmos', 'rainbow'], name: '宇宙の彩り', emoji: '🌌', desc: '合体スコアに+50%追加', effect: 'score_bonus', bonus: 0.5 },
	{ relics: ['shield', 'talisman'], name: '鉄壁の守護', emoji: '🛡️', desc: 'シールド+2（習得時）', effect: 'shield_bonus', bonus: 2 },
	{ relics: ['rebirth', 'meteor'], name: '再生の豪雨', emoji: '🌧️', desc: '毎合体5%でサイズ1が追加降下', effect: 'rebirth_plus' },
];

// ============================================================
// EVENT DEFINITIONS
// ============================================================
const EVENT_DEFS = [
	{ id: 'evt_score2x',      name: 'スコア2倍タイム！',  emoji: '✨', desc: 'このフロア中、合体スコアが2倍', type: 'score2x' },
	{ id: 'evt_coins50',      name: 'コイン大量！',        emoji: '🪙', desc: 'コインを50枚獲得',             type: 'coins', amount: 50 },
	{ id: 'evt_clear3',       name: '空間整理',            emoji: '💨', desc: '盤面のフルーツを3個消去',       type: 'clear3' },
	{ id: 'evt_sale30',       name: 'レリックセール！',    emoji: '🏷️', desc: 'このフロアのショップが30%OFF',  type: 'sale30' },
	{ id: 'evt_gravity_half', name: '無重力ゾーン！',      emoji: '🌌', desc: 'このフロアの重力が半分',        type: 'gravity_half' },
	{ id: 'evt_combo2x',      name: 'コンボフィーバー！',  emoji: '🔥', desc: 'コンボボーナスが2倍',           type: 'combo2x' },
	{ id: 'evt_shield',       name: '守護の恵み',          emoji: '🛡️', desc: 'シールドを1つ獲得',             type: 'shield' },
	{ id: 'evt_bad_coins',    name: '財布を盗まれた！',    emoji: '😈', desc: 'コイン-30（呪い）',             type: 'coins', amount: -30 },
];

// ============================================================
// MILESTONE DEFINITIONS
// ============================================================
const MILESTONE_DEFS = [
	{ anteIndex: 2,  name: 'ゾーン1中盤突破', emoji: '🌱', reward: { coins: 20 } },
	{ anteIndex: 4,  name: 'ゾーン1 BOSS討伐', emoji: '⚔️', reward: { coins: 40 } },
	{ anteIndex: 7,  name: 'ゾーン2中盤突破', emoji: '🔥', reward: { coins: 50 } },
	{ anteIndex: 9,  name: 'ゾーン2 BOSS討伐', emoji: '⚔️', reward: { coins: 80 } },
	{ anteIndex: 12, name: 'ゾーン3中盤突破', emoji: '⚡', reward: { coins: 80 } },
];

// ============================================================
// CURSE DEFINITIONS
// ============================================================
const CURSE_DEFS = [
	{ id: 'curse_gravity', name: '重力の呪い',     emoji: '⬇️', rarity: 'curse',
	  desc: '重力1.5倍になる。対価: コイン+80', coinBonus: 80 },
	{ id: 'curse_target',  name: '高難易度の呪い', emoji: '📈', rarity: 'curse',
	  desc: 'スコア目標+25%。対価: コイン+60', coinBonus: 60 },
	{ id: 'curse_size',    name: '縮小の呪い',     emoji: '🔻', rarity: 'curse',
	  desc: 'ドロップできるサイズ上限が-1。対価: スコアボーナス+20%', scoreBuff: 0.20 },
];

// ── ZONE CONFIG: 3 zones × 5 antes ──────────────────────────
const ZONE_CONFIG = [
	// Zone 1: 入門地帯
	{ zone: 1, ante: 1, target: 320,  gravity: 1.0,  label: '🌱 Zone 1-1' },
	{ zone: 1, ante: 2, target: 500,  gravity: 1.05, label: '🌱 Zone 1-2' },
	{ zone: 1, ante: 3, target: 810,  gravity: 1.10, label: '🌱 Zone 1-3' },
	{ zone: 1, ante: 4, target: 1200, gravity: 1.17, label: '🌱 Zone 1-4' },
	{ zone: 1, ante: 5, target: 1500, gravity: 1.28, label: '🐉 Zone 1 BOSS' },
	// Zone 2: 修練の地
	{ zone: 2, ante: 1, target: 1900, gravity: 1.15, label: '🔥 Zone 2-1' },
	{ zone: 2, ante: 2, target: 2280, gravity: 1.22, label: '🔥 Zone 2-2' },
	{ zone: 2, ante: 3, target: 2680, gravity: 1.30, label: '🔥 Zone 2-3' },
	{ zone: 2, ante: 4, target: 2920, gravity: 1.40, label: '🔥 Zone 2-4' },
	{ zone: 2, ante: 5, target: 3400, gravity: 1.55, label: '🐉 Zone 2 BOSS' },
	// Zone 3: 伝説の頂
	{ zone: 3, ante: 1, target: 4100, gravity: 1.35, label: '⚡ Zone 3-1' },
	{ zone: 3, ante: 2, target: 5090, gravity: 1.45, label: '⚡ Zone 3-2' },
	{ zone: 3, ante: 3, target: 6250, gravity: 1.58, label: '⚡ Zone 3-3' },
	{ zone: 3, ante: 4, target: 7650, gravity: 1.74, label: '⚡ Zone 3-4' },
	{ zone: 3, ante: 5, target: 9999, gravity: 1.95, label: '👑 FINAL BOSS' },
];

// ============================================================
// ARCANA DEFINITIONS (12 cards, draw 1 per Ante)
// ============================================================
const ARCANA_DEFS = [
	// ── COMMON (3) ──
	{ id: 'fool',           name: 'The Fool',           emoji: '🃏', rarity: 'common',
	  desc: 'このフロアの目標スコア -20%' },
	{ id: 'magician',       name: 'The Magician',       emoji: '🎩', rarity: 'common',
	  desc: '次3回のドロップが同じサイズ' },
	{ id: 'high_priestess', name: 'The High Priestess', emoji: '🌙', rarity: 'common',
	  desc: '合体時15%でコイン+3' },
	// ── UNCOMMON (3) ──
	{ id: 'emperor',        name: 'The Emperor',        emoji: '🔴', rarity: 'uncommon',
	  desc: '全合体スコア ×1.5（このフロアのみ）' },
	{ id: 'chariot',        name: 'The Chariot',        emoji: '🏎️', rarity: 'uncommon',
	  desc: '重力 -25%（このフロアのみ）' },
	{ id: 'hermit',         name: 'The Hermit',         emoji: '🕯️', rarity: 'uncommon',
	  desc: 'ショップで1個無料（1回限り）' },
	// ── RARE (6) ──
	{ id: 'tower',          name: 'The Tower',          emoji: '🗼', rarity: 'rare',
	  desc: '最大サイズ合体時にスコア×3' },
	{ id: 'star',           name: 'The Star',           emoji: '⭐', rarity: 'rare',
	  desc: '合体5回ごとにサイズ1を3個降下' },
	{ id: 'moon_arcana',    name: 'The Moon',           emoji: '🌕', rarity: 'rare',
	  desc: '次のフルーツが必ずサイズ7（1回のみ）' },
	{ id: 'sun',            name: 'The Sun',            emoji: '☀️', rarity: 'rare',
	  desc: 'このフロア中、コンボボーナス ×3' },
	{ id: 'devil',          name: 'The Devil',          emoji: '😈', rarity: 'rare',
	  desc: 'ボスフロアのみ デスリュウガ強化' },
	{ id: 'world',          name: 'The World',          emoji: '🌍', rarity: 'rare',
	  desc: '目標スコア達成時にコイン+100' },
];

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;')
		.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// GAME OBJECT
// ============================================================
const Game = {
	width: 640,
	height: 960,

	elements: {
		canvas:           document.getElementById('game-canvas'),
		ui:               document.getElementById('game-ui'),
		score:            document.getElementById('game-score'),
		end:              document.getElementById('game-end-container'),
		endTitle:         document.getElementById('game-end-title'),
		endScoreDisplay:  document.getElementById('game-end-score-display'),
		endChallengeResult: document.getElementById('game-end-challenge-result'),
		playerNameInput:  document.getElementById('player-name-input'),
		statusValue:      document.getElementById('game-highscore-value'),
		nextFruitImg:     document.getElementById('game-next-fruit'),
		currentFruitImg:  document.getElementById('game-current-fruit'),
		menuUi:           document.getElementById('menu-ui'),
		settingsOverlay:  document.getElementById('settings-overlay'),
		leaderboardOverlay: document.getElementById('leaderboard-overlay'),
		leaderboardList:  document.getElementById('leaderboard-list'),
		scorePopups:      document.getElementById('score-popups'),
		comboDisplay:     document.getElementById('combo-display'),
		comboCount:       document.getElementById('combo-count'),
		timerDisplay:     document.getElementById('timer-display'),
		timerValue:       document.getElementById('timer-value'),
		challengeDisplay: document.getElementById('challenge-display'),
		challengeText:    document.getElementById('challenge-text'),
		challengeProgress: document.getElementById('challenge-progress'),
		celebrationOverlay: document.getElementById('celebration-overlay'),
		celebrationText:  document.getElementById('celebration-text'),
		statsContent:     document.getElementById('stats-content'),
		previewBall: null,
	},

	// ── Persistent cache ──────────────────────────────────
	cache: { highscore: 0 },

	// ── Settings ──────────────────────────────────────────
	settings: {
		bgmVolume: 50,    // 0–100
		sfxVolume: 5,     // 0–100
		darkMode: false,
		gameMode: 'normal', // 'normal' | 'timeattack' | 'challenge'
	},

	loadSettings: function () {
		const saved = localStorage.getItem('ryugagay-settings');
		if (saved) {
			try { Game.settings = { ...Game.settings, ...JSON.parse(saved) }; } catch (e) {}
		}
		// Migrate removed mode: hardcoreroguerun → hardroguerun
		if (Game.settings.gameMode === 'hardcoreroguerun') {
			Game.settings.gameMode = 'hardroguerun';
		}
		// Apply to UI controls
		document.getElementById('bgm-volume').value        = Game.settings.bgmVolume;
		document.getElementById('sfx-volume').value        = Game.settings.sfxVolume;
		document.getElementById('bgm-volume-label').innerText = Game.settings.bgmVolume + '%';
		document.getElementById('sfx-volume-label').innerText = Game.settings.sfxVolume + '%';
		document.getElementById('dark-mode-toggle').checked  = Game.settings.darkMode;
		document.getElementById('dark-mode-label').innerText  = Game.settings.darkMode ? 'ダーク' : 'ライト';
		Game.applySettings();
		Game.applyDarkMode(Game.settings.darkMode);
	},

	saveSettings: function () {
		localStorage.setItem('ryugagay-settings', JSON.stringify(Game.settings));
	},

	applySettings: function () {
		const bgmVol = Game.settings.bgmVolume / 100;
		const sfxVol = Game.settings.sfxVolume / 100;
		// Use muted flag for zero-volume (iOS ignores .volume programmatically)
		Game.sounds.backgroundMusic.volume = bgmVol;
		Game.sounds.backgroundMusic.muted  = (bgmVol === 0);
		Game.sounds.click.volume = sfxVol;
		Game.sounds.click.muted  = (sfxVol === 0);
		for (let i = 0; i <= 10; i++) {
			Game.sounds[`pop${i}`].volume = sfxVol;
			Game.sounds[`pop${i}`].muted  = (sfxVol === 0);
		}
	},

	applyDarkMode: function (isDark) {
		document.body.classList.toggle('dark-mode', isDark);
		// Update Matter.js canvas background
		render.options.background = isDark ? '#1a1a2e' : '#ffdcae';
		// Update wall fill style (walls are in gameStatics)
		const wallColor = isDark ? '#1a1a2e' : '#FFEEDB';
		gameStatics.forEach(b => { b.render.fillStyle = wallColor; });
	},

	// ── Leaderboard (mode-specific) ───────────────────────
	leaderboards: { normal: [], timeattack: [], challenge: [], roguerun: [], hardroguerun: [] },

	loadAllLeaderboards: function () {
		['normal', 'timeattack', 'challenge', 'roguerun', 'hardroguerun'].forEach(mode => {
			const saved = localStorage.getItem(`ryugagay-lb-${mode}`);
			if (saved) { try { Game.leaderboards[mode] = JSON.parse(saved); } catch (e) {} }
		});
	},

	saveToLeaderboard: function (name, score, mode) {
		if (score <= 0 || !mode) return;
		const lb = Game.leaderboards[mode] || [];
		lb.push({
			name: (name || '名無し').trim() || '名無し',
			score,
			date: new Date().toLocaleDateString('ja-JP'),
		});
		lb.sort((a, b) => b.score - a.score);
		Game.leaderboards[mode] = lb.slice(0, 10);
		localStorage.setItem(`ryugagay-lb-${mode}`, JSON.stringify(Game.leaderboards[mode]));
	},

	renderLeaderboard: function (entries) {
		const list = Game.elements.leaderboardList;
		const data = entries || Game.leaderboard;
		if (data.length === 0) {
			list.innerHTML = '<div class="lb-empty">まだ記録がありません</div>';
			return;
		}
		const medals = ['🥇', '🥈', '🥉'];
		list.innerHTML = data.map((e, i) =>
			`<div class="lb-row${i === 0 ? ' lb-first' : ''}">
				<span class="lb-rank">${medals[i] || '#' + (i + 1)}</span>
				<span class="lb-name">${escapeHtml(e.name)}</span>
				<span class="lb-score">${e.score}</span>
				<span class="lb-date">${escapeHtml(e.date)}</span>
			</div>`
		).join('');
	},

	// ── Online Leaderboard (Supabase) ────────────────────
	// anonKeyはpublic readのみ設計なので、コードに埋め込んでもセキュリティ上OK
	_sbHeaders: function () {
		return {
			'apikey': ONLINE_LB.anonKey,
			'Authorization': `Bearer ${ONLINE_LB.anonKey}`,
			'Content-Type': 'application/json',
		};
	},

	fetchOnlineLeaderboard: async function (mode) {
		if (!ONLINE_LB.enabled) return [];
		try {
			// Filter by mode if supported (add ?mode=eq.X). Gracefully handles missing column.
			const modeFilter = mode ? `&mode=eq.${mode}` : '';
			const r = await fetch(
				`${ONLINE_LB.url}/rest/v1/leaderboard?select=name,score,data${modeFilter}&order=score.desc&limit=20`,
				{ headers: Game._sbHeaders() }
			);
			if (!r.ok) return [];
			const rows = await r.json();
			return rows.map(row => ({ name: row.name, score: row.score, date: row.data }));
		} catch { return []; }
	},

	saveToOnlineLeaderboard: async function (name, score, mode) {
		if (!ONLINE_LB.enabled || score <= 0) return;
		try {
			const res = await fetch(`${ONLINE_LB.url}/rest/v1/leaderboard`, {
				method: 'POST',
				headers: { ...Game._sbHeaders(), 'Prefer': 'return=minimal' },
				body: JSON.stringify({
					name: (name || '名無し').trim() || '名無し',
					score,
					data: new Date().toLocaleDateString('ja-JP'),
					mode: mode || 'normal',
				}),
			});
			if (!res.ok) console.warn('Supabase write failed:', res.status, await res.text());
		} catch (e) { console.warn('Supabase network error:', e); }
	},

	showOnlineLeaderboard: async function (mode) {
		const list = Game.elements.leaderboardList;
		list.innerHTML = '<div class="lb-empty">読み込み中...</div>';
		if (!ONLINE_LB.enabled) {
			list.innerHTML = '<div class="lb-empty">オンラインリーダーボードは未設定です</div>';
			return;
		}
		const entries = await Game.fetchOnlineLeaderboard(mode);
		Game.renderLeaderboard(entries);
	},

	// ── Audio ─────────────────────────────────────────────
	sounds: {
		click: new Audio('./assets/click.mp3'),
		pop0: new Audio('./assets/pop0.mp3'),
		pop1: new Audio('./assets/pop1.mp3'),
		pop2: new Audio('./assets/pop2.mp3'),
		pop3: new Audio('./assets/pop3.mp3'),
		pop4: new Audio('./assets/pop4.mp3'),
		pop5: new Audio('./assets/pop5.mp3'),
		pop6: new Audio('./assets/pop6.mp3'),
		pop7: new Audio('./assets/pop7.mp3'),
		pop8: new Audio('./assets/pop8.mp3'),
		pop9: new Audio('./assets/pop9.mp3'),
		pop10: new Audio('./assets/pop10.mp3'),
		backgroundMusic: new Audio('./assets/bgm.mp3'),
	},

	// ── Score ─────────────────────────────────────────────
	stateIndex: GameStates.MENU,
	score: 0,
	fruitsMerged: [],
	extraPoints: 0,        // combo & challenge bonuses

	calculateScore: function () {
		const base = Game.fruitsMerged.reduce((total, count, i) =>
			total + Game.fruitSizes[i].scoreValue * count, 0);
		Game.score = base + Game.extraPoints;
		Game.elements.score.innerText = Game.score;

		// Roguerun: check if ante target reached
		if (Game.rogueRun.active && !Game.rogueRun.anteCleared &&
		    Game.stateIndex !== GameStates.LOSE && Game.stateIndex !== GameStates.SHOP) {
			// keepScore モード: このAnteで稼いだ分（差分）と目標を比較
			const anteScore = Game.rogueRun.keepScore
				? Game.score - Game.rogueRun.anteScoreBase
				: Game.score;
			if (anteScore >= Game.rogueRun.scoreTarget) {
				Game.onAnteClear();
			}
		}
		// Update rogue HUD progress bar
		if (Game.rogueRun.active) Game.updateRogueHud();
	},

	fruitSizes: [
		{ radius: 24,  scoreValue: 1,  img: './assets/img/circle0.png'  },
		{ radius: 32,  scoreValue: 3,  img: './assets/img/circle1.png'  },
		{ radius: 40,  scoreValue: 6,  img: './assets/img/circle2.png'  },
		{ radius: 56,  scoreValue: 10, img: './assets/img/circle3.png'  },
		{ radius: 64,  scoreValue: 15, img: './assets/img/circle4.png'  },
		{ radius: 72,  scoreValue: 21, img: './assets/img/circle5.png'  },
		{ radius: 84,  scoreValue: 28, img: './assets/img/circle6.png'  },
		{ radius: 96,  scoreValue: 36, img: './assets/img/circle7.png'  },
		{ radius: 128, scoreValue: 45, img: './assets/img/circle8.png'  },
		{ radius: 160, scoreValue: 55, img: './assets/img/circle9.png'  },
		{ radius: 192, scoreValue: 66, img: './assets/img/circle10.png' },
	],
	currentFruitSize: 0,
	nextFruitSize: 0,

	setNextFruitSize: function () {
		const rr = Game.rogueRun;
		// Magician arcana: force same size for N drops
		if (rr.active && rr.arcana && rr.arcana.id === 'magician' && rr.arcanaState.magicianCount > 0) {
			rr.arcanaState.magicianCount--;
			// size stays the same - don't change currentFruitSize
			Game.updateCurrentFruitDisplay();
			return;
		}
		// Moon arcana: next drop is size 7
		if (rr.active && rr.arcana && rr.arcana.id === 'moon_arcana' && rr.arcanaState.moonReady) {
			rr.arcanaState.moonReady = false;
			Game.currentFruitSize = Game.fruitSizes.length - 1;
			Game.updateCurrentFruitDisplay();
			return;
		}
		let size;

		// Relic: butterfly → cycle through sizes 0-4 in order
		if (rr.active && rr.relics.some(r => r.id === 'butterfly')) {
			rr.cycleSize = (rr.cycleSize + 1) % 5;
			size = rr.cycleSize;
		} else {
			size = Math.floor(rand() * 5);
			// Relic: lucky_cat → 60% chance next = current size
			if (rr.active && rr.relics.some(r => r.id === 'lucky_cat')) {
				if (Math.random() < 0.6) size = Game.currentFruitSize;
			}
			// Relic: size_up → 30% chance +1 size (capped at 4)
			if (rr.active && rr.relics.some(r => r.id === 'size_up')) {
				if (Math.random() < 0.3) size = Math.min(size + 1, 4);
			}
		}

		// curse_size: cap drop size to 3
		if (rr.active && rr.activeCurses && rr.activeCurses.includes('curse_size')) {
			size = Math.min(size, 3);
		}
		Game.nextFruitSize = size;
		Game.elements.nextFruitImg.src = `./assets/img/circle${size}.png`;
	},

	// ── Current fruit display (status bar "Now") ──────────
	updateCurrentFruitDisplay: function () {
		Game.elements.currentFruitImg.src = `./assets/img/circle${Game.currentFruitSize}.png`;
	},

	// ── Highscore ─────────────────────────────────────────
	showHighscore: function () {
		Game.elements.statusValue.innerText = Game.cache.highscore;
	},

	loadHighscore: function () {
		const raw = localStorage.getItem('suika-game-cache');
		if (raw === null) {
			localStorage.setItem('suika-game-cache', JSON.stringify(Game.cache));
			return;
		}
		Game.cache = JSON.parse(raw);
		Game.showHighscore();
	},

	saveHighscore: function () {
		if (Game.score > Game.cache.highscore) {
			Game.cache.highscore = Game.score;
			Game.showHighscore();
			localStorage.setItem('suika-game-cache', JSON.stringify(Game.cache));
		}
	},

	// ── Combo ─────────────────────────────────────────────
	combo: 0,
	comboTimer: null,
	maxComboReached: 0,

	handleCombo: function (sizeIndex) {
		clearTimeout(Game.comboTimer);
		Game.combo++;
		if (Game.combo > Game.maxComboReached) Game.maxComboReached = Game.combo;

		if (Game.combo >= 2) {
			const el = Game.elements.comboDisplay;
			Game.elements.comboCount.innerText = Game.combo;
			el.style.display = 'block';
			el.style.animation = 'none';
			void el.offsetWidth; // reflow
			el.style.animation = 'comboAppear 0.25s ease-out';

			// Combo bonus points (Relics: combo_master ×2, dragon ×5, stack multiplicatively)
			let comboMult = 1;
			if (Game.rogueRun.active) {
				if (Game.rogueRun.relics.some(r => r.id === 'combo_master')) comboMult *= 2;
				if (Game.rogueRun.relics.some(r => r.id === 'dragon'))       comboMult *= 5;
				// Sun arcana: combo ×3 this ante
				if (Game.rogueRun.arcana && Game.rogueRun.arcana.id === 'sun') {
					comboMult = (comboMult || 1) * 3;
				}
			}
			const bonus = Math.floor(Game.fruitSizes[sizeIndex].scoreValue * (Game.combo - 1) * 0.4 * comboMult);
			if (bonus > 0) {
				Game.extraPoints += bonus;
				Game.showBonusPopup(bonus);
			}
		}

		Game.comboTimer = setTimeout(() => {
			Game.combo = 0;
			const el = Game.elements.comboDisplay;
			el.style.animation = 'comboFadeOut 0.4s ease-out forwards';
			setTimeout(() => { el.style.display = 'none'; el.style.animation = ''; }, 400);
		}, 1600);
	},

	// ── Score popups ──────────────────────────────────────
	addScorePopup: function (x, y, sizeIndex) {
		const pts = Game.fruitSizes[sizeIndex].scoreValue;
		const popup = document.createElement('div');
		popup.className = 'score-popup';
		popup.innerText = `+${pts}`;
		popup.style.left = (x - 28) + 'px';
		popup.style.top  = (y - 20) + 'px';
		Game.elements.scorePopups.appendChild(popup);
		setTimeout(() => popup.remove(), 900);
	},

	showBonusPopup: function (bonus) {
		const popup = document.createElement('div');
		popup.className = 'score-popup combo-popup';
		popup.innerText = `COMBO +${bonus}`;
		// Show near top-right
		popup.style.right = '20px';
		popup.style.top   = '200px';
		Game.elements.scorePopups.appendChild(popup);
		setTimeout(() => popup.remove(), 900);
	},

	// ── Max fruit celebration ─────────────────────────────
	showCelebration: function (text) {
		const overlay = Game.elements.celebrationOverlay;
		Game.elements.celebrationText.innerText = text;
		overlay.style.animation = 'none';
		Game.elements.celebrationText.style.animation = 'none';
		overlay.style.display = 'flex';
		void overlay.offsetWidth; // reflow to restart animation
		overlay.style.animation = 'celebFlash 1.1s ease-out forwards';
		Game.elements.celebrationText.style.animation = 'celebText 1.1s ease-out forwards';
		setTimeout(() => { overlay.style.display = 'none'; }, 1150);
	},

	// ── Challenge ─────────────────────────────────────────
	currentChallenge: null,
	challengeCompleted: false,
	challengesCleared: 0,

	challenges: [
		// ── NORMAL ──────────────────────────────────────────────
		{ diff: 'normal', reward: 80,
		  text: 'サイズ2を5回合体！',
		  check:    () => Game.fruitsMerged[1] >= 5,
		  progress: () => `${Math.min(Game.fruitsMerged[1], 5)}/5回` },
		{ diff: 'normal', reward: 90,
		  text: 'サイズ3を4回合体！',
		  check:    () => Game.fruitsMerged[2] >= 4,
		  progress: () => `${Math.min(Game.fruitsMerged[2], 4)}/4回` },
		{ diff: 'normal', reward: 100,
		  text: 'サイズ4を3回合体！',
		  check:    () => Game.fruitsMerged[3] >= 3,
		  progress: () => `${Math.min(Game.fruitsMerged[3], 3)}/3回` },
		{ diff: 'normal', reward: 80,
		  text: '合計8回以上合体！',
		  check:    () => Game.fruitsMerged.reduce((a, b) => a + b, 0) >= 8,
		  progress: () => `${Math.min(Game.fruitsMerged.reduce((a, b) => a + b, 0), 8)}/8回` },
		{ diff: 'normal', reward: 110,
		  text: '合計15回以上合体！',
		  check:    () => Game.fruitsMerged.reduce((a, b) => a + b, 0) >= 15,
		  progress: () => `${Math.min(Game.fruitsMerged.reduce((a, b) => a + b, 0), 15)}/15回` },
		{ diff: 'normal', reward: 80,
		  text: 'スコア150点突破！',
		  check:    () => Game.score >= 150,
		  progress: () => `${Game.score}/150点` },
		{ diff: 'normal', reward: 120,
		  text: 'スコア300点突破！',
		  check:    () => Game.score >= 300,
		  progress: () => `${Game.score}/300点` },
		{ diff: 'normal', reward: 100,
		  text: 'コンボ3以上を決めろ！',
		  check:    () => Game.maxComboReached >= 3,
		  progress: () => `最大${Game.maxComboReached}コンボ` },
		{ diff: 'normal', reward: 130,
		  text: 'コンボ4以上を決めろ！',
		  check:    () => Game.maxComboReached >= 4,
		  progress: () => `最大${Game.maxComboReached}コンボ` },
		{ diff: 'normal', reward: 120,
		  text: 'サイズ5を2回作れ！',
		  check:    () => Game.fruitsMerged[4] >= 2,
		  progress: () => `${Math.min(Game.fruitsMerged[4], 2)}/2回` },
		{ diff: 'normal', reward: 130,
		  text: 'サイズ6を作れ！',
		  check:    () => Game.fruitsMerged[5] > 0,
		  progress: () => Game.fruitsMerged[5] > 0 ? '達成！' : '未達成' },
		{ diff: 'normal', reward: 150,
		  text: 'サイズ7を作れ！',
		  check:    () => Game.fruitsMerged[6] > 0,
		  progress: () => Game.fruitsMerged[6] > 0 ? '達成！' : '未達成' },

		// ── HARD ────────────────────────────────────────────────
		{ diff: 'hard', reward: 280,
		  text: 'コンボ5以上を決めろ！',
		  check:    () => Game.maxComboReached >= 5,
		  progress: () => `最大${Game.maxComboReached}コンボ` },
		{ diff: 'hard', reward: 420,
		  text: 'コンボ6以上を決めろ！',
		  check:    () => Game.maxComboReached >= 6,
		  progress: () => `最大${Game.maxComboReached}コンボ` },
		{ diff: 'hard', reward: 350,
		  text: 'スコア500点突破！',
		  check:    () => Game.score >= 500,
		  progress: () => `${Game.score}/500点` },
		{ diff: 'hard', reward: 500,
		  text: 'スコア800点突破！',
		  check:    () => Game.score >= 800,
		  progress: () => `${Game.score}/800点` },
		{ diff: 'hard', reward: 350,
		  text: 'サイズ6を3回作れ！',
		  check:    () => Game.fruitsMerged[5] >= 3,
		  progress: () => `${Math.min(Game.fruitsMerged[5], 3)}/3回` },
		{ diff: 'hard', reward: 400,
		  text: 'サイズ7を2回作れ！',
		  check:    () => Game.fruitsMerged[6] >= 2,
		  progress: () => `${Math.min(Game.fruitsMerged[6], 2)}/2回` },
		{ diff: 'hard', reward: 450,
		  text: 'サイズ8を作れ！',
		  check:    () => Game.fruitsMerged[7] > 0,
		  progress: () => Game.fruitsMerged[7] > 0 ? '達成！' : '未達成' },
		{ diff: 'hard', reward: 600,
		  text: 'サイズ9を作れ！',
		  check:    () => Game.fruitsMerged[8] > 0,
		  progress: () => Game.fruitsMerged[8] > 0 ? '達成！' : '未達成' },
		{ diff: 'hard', reward: 280,
		  text: '合計25回以上合体！',
		  check:    () => Game.fruitsMerged.reduce((a, b) => a + b, 0) >= 25,
		  progress: () => `${Math.min(Game.fruitsMerged.reduce((a, b) => a + b, 0), 25)}/25回` },
		{ diff: 'hard', reward: 380,
		  text: '合体40回以上！',
		  check:    () => Game.fruitsMerged.reduce((a, b) => a + b, 0) >= 40,
		  progress: () => `${Math.min(Game.fruitsMerged.reduce((a, b) => a + b, 0), 40)}/40回` },
	],

	pickChallenge: function () {
		// 25% chance of hard challenge; first challenge is always normal
		const isHard = Game.challengesCleared > 0 && Math.random() < 0.25;
		const diff = isHard ? 'hard' : 'normal';

		// Filter by difficulty, avoid immediate repeat
		let pool = Game.challenges.filter(c => c.diff === diff && c !== Game.currentChallenge);
		if (pool.length === 0) pool = Game.challenges.filter(c => c.diff === diff);  // fallback
		if (pool.length === 0) pool = Game.challenges;  // last resort

		Game.currentChallenge = pool[Math.floor(rand() * pool.length)];
		Game.challengeCompleted = false;

		const el = Game.elements.challengeDisplay;
		el.style.display = 'block';
		el.classList.remove('completed', 'hard');
		if (isHard) el.classList.add('hard');

		document.getElementById('challenge-title').innerText = isHard ? '🔥 HIGH RISK' : 'CHALLENGE';
		document.getElementById('challenge-num').innerText =
			Game.challengesCleared > 0 ? `#${Game.challengesCleared + 1}` : '';
		Game.elements.challengeText.innerText = Game.currentChallenge.text;
		Game.elements.challengeProgress.innerText = '';
		document.getElementById('challenge-reward').innerText =
			`報酬: +${Game.currentChallenge.reward}pts`;
	},

	checkChallenge: function () {
		if (!Game.currentChallenge || Game.challengeCompleted) return;
		Game.elements.challengeProgress.innerText = Game.currentChallenge.progress();

		if (Game.currentChallenge.check()) {
			Game.challengeCompleted = true;
			Game.challengesCleared++;

			const reward = Game.currentChallenge.reward;
			Game.extraPoints += reward;
			Game.calculateScore();

			const el = Game.elements.challengeDisplay;
			el.classList.add('completed');
			Game.elements.challengeText.innerText = '✅ ' + Game.currentChallenge.text;
			Game.elements.challengeProgress.innerText = `クリア！ +${reward}pts ボーナス！`;
			document.getElementById('challenge-reward').innerText = '';

			// 🎊 celebration for hard clears
			if (Game.currentChallenge.diff === 'hard') {
				Game.showCelebration('🔥 HIGH RISK クリア！ 🔥');
			}

			// Chain: pick next challenge after 2.8s
			setTimeout(() => {
				if (Game.stateIndex === GameStates.LOSE) return;
				Game.pickChallenge();
			}, 2800);
		}
	},

	// ── Timer (time attack) ───────────────────────────────
	timeLeft: 60,
	timerInterval: null,

	startTimer: function () {
		Game.timeLeft = 60;
		Game.elements.timerDisplay.style.display = 'block';
		Game.elements.timerDisplay.classList.remove('urgent');
		Game.elements.timerValue.innerText = Game.timeLeft;

		Game.timerInterval = setInterval(() => {
			Game.timeLeft--;
			Game.elements.timerValue.innerText = Game.timeLeft;
			if (Game.timeLeft <= 10) Game.elements.timerDisplay.classList.add('urgent');
			if (Game.timeLeft <= 0) {
				clearInterval(Game.timerInterval);
				Game.timerInterval = null;
				Game.loseGame();
			}
		}, 1000);
	},

	// ── Stats ─────────────────────────────────────────────
	renderStats: function () {
		const content = Game.elements.statsContent;
		const maxCount = Math.max(...Game.fruitsMerged, 1);
		const rows = Game.fruitsMerged
			.map((count, i) => ({ count, i }))
			.filter(({ count }) => count > 0)
			.map(({ count, i }) => {
				const pct = Math.round((count / maxCount) * 100);
				return `<div class="stats-row">
					<img class="stats-icon" src="${Game.fruitSizes[i].img}" />
					<span class="stats-label">サイズ${i + 1}</span>
					<div class="stats-bar-wrap"><div class="stats-bar" style="width:${pct}%"></div></div>
					<span class="stats-count">${count}</span>
				</div>`;
			});

		content.innerHTML = rows.length
			? rows.join('')
			: '<div style="text-align:center;color:#999;font-size:13px;padding:10px">合体なし</div>';
	},

	// ── Share / Screenshot ────────────────────────────────
	copyScore: function () {
		const m = Game.settings.gameMode;
		const modeNames = {
			normal:           'ノーマル',
			timeattack:       'タイムアタック',
			challenge:        'チャレンジ',
			roguerun:         'ローグラン（ノーマル）',
			hardroguerun:     'ローグラン（ハード）',
			hardcoreroguerun: 'ローグラン（ハードコア）',
		};
		const isRogue  = ['roguerun', 'hardroguerun', 'hardcoreroguerun'].includes(m);
		const score    = isRogue ? Game.rogueRun.totalScore : Game.score;
		const modeName = modeNames[m] || 'ノーマル';
		const text = `リュウガゲイ夢（改）\nスコア: ${score}点\n最高記録: ${Game.cache.highscore}点\nモード: ${modeName}\n#リュウガゲイ夢改`;
		navigator.clipboard.writeText(text).catch(() => {});
	},

	takeScreenshot: function () {
		const src = render.canvas;
		const tmp = document.createElement('canvas');
		tmp.width  = src.width;
		tmp.height = src.height;
		const ctx = tmp.getContext('2d');

		try {
			ctx.drawImage(src, 0, 0);
		} catch (e) {
			alert('スクリーンショットの保存に失敗しました（セキュリティ制限）');
			return;
		}

		// スコアオーバーレイ
		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.beginPath();
		if (ctx.roundRect) ctx.roundRect(12, 12, 330, 96, 18);
		else ctx.rect(12, 12, 330, 96);
		ctx.fill();
		ctx.fillStyle = 'white';
		ctx.font = '900 68px monospace';
		ctx.fillText(Game.score, 24, 80);
		ctx.font = '700 20px monospace';
		ctx.fillStyle = 'rgba(255,255,255,0.75)';
		ctx.fillText('リュウガゲイ夢（改）', 24, 102);

		try {
			const dataUrl = tmp.toDataURL('image/png');
			const link = document.createElement('a');
			link.download = `ryugagay-${Game.score}.png`;
			link.href = dataUrl;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} catch (e) {
			// フォールバック: 新しいタブで開く
			const win = window.open('', '_blank');
			if (win) {
				win.document.write(`<img src="${tmp.toDataURL('image/png')}" style="max-width:100%">`);
			}
		}
	},

	// ── Roguelike Run ─────────────────────────────────────
	rogueRun: {
		active:       false,
		anteIndex:    0,       // 0–14, index into ZONE_CONFIG
		zone:         1,       // current zone (1–3)
		anteInZone:   1,       // current ante within zone (1–5)
		maxZones:     3,
		antesPerZone: 5,
		coins:        0,
		relics:       [],      // array of RELIC_DEFS entries held by player
		shopOffers:   [],      // current shop offers
		scoreTarget:  0,       // target for current ante
		anteCleared:  false,
		anteScores:   [],
		totalScore:   0,
		shieldCharges: 0,      // shield charges remaining (shield +1, talisman +3)
		mergeCount:   0,       // total merges this ante (for meteor relic)
		cycleSize:    0,       // current butterfly cycle size
		persistent:     false,  // if true: board is NOT cleared between antes
		keepScore:      false,  // if true: score is NOT reset between antes (ハードモード)
		anteScoreBase:  0,      // score at start of current ante (keepScore用ベースライン)
		anteStartTime:  0,      // timestamp of last ante start (for grace period in hardcore)
		// ── v14 additions ──
		arcana:        null,    // current ante's arcana card (one of ARCANA_DEFS)
		arcanaState:   {},      // per-arcana ephemeral state
		rerollCount:   0,       // re-rolls used this shop phase
		purgeUsed:     false,   // purge token used this ante
		sellPending:   null,    // relic idx awaiting sell-confirm tap (Hardroguerun)
		// ── v14.2 additions ──
		isBossShop:      false, // current shop is post-boss
		bossChestDone:   false, // chest already opened this shop
		activeEvent:     null,  // current floor event (from EVENT_DEFS)
		activeCurses:    [],    // active curse IDs
		milestonesClaimed: [],  // array of claimed anteIndex values
		saleActive:      false, // shop sale (from event)
		rerollCharges:   -999,  // -1=unlimited, 0+=counted, -999=no relic
		activeSynergies: [],    // active synergy keys
		curseoffer:      null,  // current curse offer in shop
		_overtimeUsed:   false, // boss_overtime already consumed
	},

	startRogueRun: function () {
		const rr = Game.rogueRun;
		rr.active        = true;
		rr.anteIndex     = 0;
		rr.zone          = 1;
		rr.anteInZone    = 1;
		rr.coins         = 0;
		rr.relics        = [];
		rr.shopOffers    = [];
		rr.anteScores    = [];
		rr.totalScore    = 0;
		rr.anteCleared   = false;
		rr.shieldCharges = 0;
		rr.mergeCount    = 0;
		rr.cycleSize     = 0;
		// roguerun:     盤面リセット・スコア累積 (ノーマル)
		// hardroguerun: 盤面持続・スコア累積   (ハード)
		const m = Game.settings.gameMode;
		rr.persistent = (m === 'hardroguerun');
		rr.keepScore  = (m === 'roguerun' || m === 'hardroguerun');
		rr.anteScoreBase = 0;
		rr.arcana        = null;
		rr.arcanaState   = {};
		rr.rerollCount   = 0;
		rr.purgeUsed     = false;
		rr.sellPending   = null;
		rr.isBossShop      = false;
		rr.bossChestDone   = false;
		rr.activeEvent     = null;
		rr.activeCurses    = [];
		rr.milestonesClaimed = [];
		rr.saleActive      = false;
		rr.rerollCharges   = -999;
		rr.activeSynergies = [];
		rr.curseoffer      = null;
		rr._overtimeUsed   = false;

		// Show rogue status bar, hide normal status
		document.getElementById('game-status').style.display = 'none';
		document.getElementById('rogue-status').style.display = 'flex';

		Game.applyZoneAnteConfig();
		Game.updateRogueHud();
	},

	applyZoneAnteConfig: function () {
		const rr  = Game.rogueRun;
		const cfg = ZONE_CONFIG[rr.anteIndex];
		rr.zone       = cfg.zone;
		rr.anteInZone = cfg.ante;
		rr.anteCleared = false;
		rr.mergeCount  = 0;
		rr.rerollCount = 0;
		rr.purgeUsed   = false;
		rr.sellPending = null;

		// ── Draw Arcana ──
		Game.drawArcana();

		// Score target (crown relic: -20%)
		let target = cfg.target;
		if (rr.relics.some(r => r.id === 'crown')) target = Math.round(target * 0.8);
		rr.scoreTarget = target;

		// Gravity (gravity_heavy relic adds 0.28; chariot arcana -25%)
		let g = cfg.gravity;
		if (rr.relics.some(r => r.id === 'gravity_heavy')) g += 0.28;
		if (rr.arcana && rr.arcana.id === 'chariot') g *= 0.75;
		// curse_gravity: multiply by 1.5
		if (rr.activeCurses && rr.activeCurses.includes('curse_gravity')) g *= 1.5;
		engine.gravity.y = g;

		// ante_bonus relic: +50pts at ante start
		if (rr.relics.some(r => r.id === 'ante_bonus')) {
			Game.extraPoints += 50;
			Game.calculateScore();
		}

		// asteroid relic: spawn 3 size-1 fruits at ante start
		if (rr.relics.some(r => r.id === 'asteroid')) {
			setTimeout(() => {
				if (Game.stateIndex !== GameStates.LOSE && Game.stateIndex !== GameStates.SHOP) {
					for (let i = 0; i < 3; i++) {
						const x = 160 + i * 160;
						Composite.add(engine.world, Game.generateFruitBody(x, 80, 1));
					}
				}
			}, 600);
		}

		// 10% chance of random event
		if (Math.random() < 0.10) {
			const evt = EVENT_DEFS[Math.floor(rand() * EVENT_DEFS.length)];
			rr.activeEvent = evt;
			// Apply immediate effects
			switch (evt.type) {
				case 'coins':
					rr.coins = Math.max(0, rr.coins + evt.amount);
					break;
				case 'clear3':
					setTimeout(() => {
						const nonStatic = Composite.allBodies(engine.world)
							.filter(b => !b.isStatic && b.sizeIndex !== null).slice(0, 3);
						if (nonStatic.length) Composite.remove(engine.world, nonStatic);
					}, 1500);
					break;
				case 'gravity_half':
					engine.gravity.y *= 0.5;
					break;
				case 'shield':
					rr.shieldCharges++;
					break;
			}
			Game.showEventPopup(evt);
		}

		Game.updateRogueHud();
	},

	updateRogueHud: function () {
		if (!Game.rogueRun.active) return;
		const rr  = Game.rogueRun;
		const cfg = ZONE_CONFIG[rr.anteIndex];

		document.getElementById('rogue-ante-label').innerText =
			`${cfg.label}  フロア ${rr.anteIndex + 1}/15`;
		document.getElementById('rogue-coins-display').innerText = `🪙 ${rr.coins}`;

		const anteScore = rr.keepScore ? Game.score - rr.anteScoreBase : Game.score;
		const pct = Math.min(100, Math.round((anteScore / rr.scoreTarget) * 100));
		document.getElementById('rogue-progress-fill').style.width = `${pct}%`;
		document.getElementById('rogue-progress-text').innerText = rr.keepScore
			? `+${anteScore} / ${rr.scoreTarget}  (計${Game.score})`
			: `${Game.score} / ${rr.scoreTarget}`;

		// Relic slots (max 6) — clickable for tooltip
		const slots = document.getElementById('rogue-joker-slots');
		const icons = rr.relics.map((r, idx) => {
			const shieldBadge = (r.id === 'shield' || r.id === 'talisman') && rr.shieldCharges > 0
				? `<sup style="font-size:9px;line-height:1;vertical-align:top">${rr.shieldCharges}</sup>` : '';
			return `<span class="rogue-joker-icon rarity-${r.rarity}" data-relic-idx="${idx}">${r.emoji}${shieldBadge}</span>`;
		}).join('');
		const empties = Array(Math.max(0, 7 - rr.relics.length))
			.fill('<span class="rogue-joker-empty"></span>').join('');
		slots.innerHTML = icons + empties;

		// Attach tooltip listeners
		slots.querySelectorAll('.rogue-joker-icon').forEach(el => {
			el.addEventListener('click', () => {
				const relic = rr.relics[parseInt(el.dataset.relicIdx)];
				if (!relic) return;
				const tooltip = document.getElementById('relic-tooltip');
				document.getElementById('relic-tooltip-name').innerText = `${relic.emoji} ${relic.name}`;
				document.getElementById('relic-tooltip-desc').innerText = relic.desc;
				tooltip.style.display = 'block';
				clearTimeout(Game._tooltipTimer);
				Game._tooltipTimer = setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
			});
		});

		// Reroll-fruit button visibility
		const rerollFruitBtn = document.getElementById('btn-reroll-fruit');
		if (rerollFruitBtn) {
			if (rr.rerollCharges === -999) {
				rerollFruitBtn.style.display = 'none';
			} else {
				rerollFruitBtn.style.display = '';
				rerollFruitBtn.disabled = rr.rerollCharges === 0;
				rerollFruitBtn.innerText = rr.rerollCharges === -1
					? '🔄 次を交換'
					: rr.rerollCharges > 0
						? `🔄 次を交換 (${rr.rerollCharges})`
						: '🔄 交換不可';
			}
		}
	},

	_tooltipTimer: null,
	_pauseReasons: [],

	pauseGame: function (reason) {
		if (Game.stateIndex !== GameStates.READY && Game.stateIndex !== GameStates.DROP) return;
		if (!Game._pauseReasons.includes(reason)) Game._pauseReasons.push(reason);
		physicsEnabled = false;
	},

	resumeGame: function (reason) {
		Game._pauseReasons = Game._pauseReasons.filter(r => r !== reason);
		if (Game._pauseReasons.length === 0) {
			const overlay = document.getElementById('pause-overlay');
			if (overlay) overlay.style.display = 'none';
			if (Game.stateIndex === GameStates.READY || Game.stateIndex === GameStates.DROP) {
				physicsEnabled = true;
			}
		}
	},

	showEventPopup: function (evt) {
		const el = document.getElementById('event-popup');
		if (!el) return;
		document.getElementById('event-popup-emoji').innerText = evt.emoji;
		document.getElementById('event-popup-name').innerText  = evt.name;
		document.getElementById('event-popup-desc').innerText  = evt.desc;
		el.style.display = 'flex';
		clearTimeout(Game._eventTimer);
		Game._eventTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
	},
	_eventTimer: null,

	// Called from calculateScore when score >= target
	onAnteClear: function () {
		if (Game.rogueRun.anteCleared) return;
		const rr = Game.rogueRun;
		rr.anteCleared = true;
		physicsEnabled = false;
		Game.stateIndex = GameStates.SHOP;

		// Accumulate score
		rr.anteScores.push(Game.score);
		rr.totalScore += Game.score;

		// Stop boss ryuga if active
		if (Game.bossRyuga.active) Game.stopBossRyuga();

		// Arcana on-clear effect
		Game.applyArcanaOnClear();

		// Alchemist relic: convert coins to score on ante clear
		if (rr.relics.some(r => r.id === 'alchemist') && rr.coins > 0) {
			const alchBonus = rr.coins * 5;
			Game.extraPoints += alchBonus;
			rr.totalScore += alchBonus;
			Game.showBonusPopup(alchBonus);
			rr.coins = 0;
		}

		const isFinalAnte  = rr.anteIndex >= 14;            // 15th ante (3×5)
		const isZoneBoss   = rr.anteInZone >= rr.antesPerZone;
		const nextZone     = rr.zone + 1;

		// Set boss shop flag for post-boss antes
		rr.isBossShop = isZoneBoss && !isFinalAnte;

		// Milestone rewards
		const milestone = MILESTONE_DEFS.find(m =>
			m.anteIndex === rr.anteIndex && !rr.milestonesClaimed.includes(rr.anteIndex)
		);
		if (milestone) {
			rr.milestonesClaimed.push(rr.anteIndex);
			if (milestone.reward.coins) rr.coins += milestone.reward.coins;
			setTimeout(() => {
				Game.showCelebration(`${milestone.emoji} マイルストーン: ${milestone.name}！ 🪙+${milestone.reward.coins}`);
			}, 400);
		}

		let celebMsg;
		if (isFinalAnte) {
			celebMsg = `👑 全Zone制覇！ 総スコア: ${rr.totalScore}`;
		} else if (isZoneBoss) {
			celebMsg = `🐉 Zone ${rr.zone} BOSS撃破！ Zone ${nextZone} へ突入！`;
		} else {
			celebMsg = `🎊 Zone ${rr.zone}-${rr.anteInZone} クリア！ 🎊`;
		}
		Game.showCelebration(celebMsg);

		const delay = isFinalAnte ? 1800 : (isZoneBoss ? 2200 : 1600);
		setTimeout(() => {
			if (isFinalAnte) {
				Game.endRogueRun(true);
			} else {
				Game.showShop();
			}
		}, delay);
	},

	showShop: function () {
		const rr = Game.rogueRun;

		// Boss shop: show chests instead of normal relics
		if (rr.isBossShop) {
			rr.shopOffers    = [];
			rr.bossChestDone = false;
			rr.curseoffer    = null;
			Game.renderShop();
			document.getElementById('shop-overlay').style.display = 'flex';
			return;
		}

		const ownedIds = rr.relics.map(r => r.id);

		// Filter by zone availability and not already owned
		const available = RELIC_DEFS.filter(r =>
			!ownedIds.includes(r.id) &&
			rr.zone >= (MIN_ZONE_FOR_RARITY[r.rarity] || 1)
		);

		// Weighted pool (higher rarity = lower weight)
		const rarityWeight = { common: 5, uncommon: 4, rare: 3, epic: 2, legendary: 1 };
		const pool = [];
		available.forEach(r => {
			const w = rarityWeight[r.rarity] || 1;
			for (let i = 0; i < w; i++) pool.push(r);
		});

		rr.shopOffers = [];
		const tempPool = [...pool];
		const seen = new Set();
		while (rr.shopOffers.length < Math.min(3, available.length) && tempPool.length > 0) {
			const idx = Math.floor(rand() * tempPool.length);
			const relic = tempPool.splice(idx, 1)[0];
			if (!seen.has(relic.id)) { seen.add(relic.id); rr.shopOffers.push(relic); }
		}

		// 30% chance to offer a curse (max 2 active)
		rr.curseoffer = null;
		if (Math.random() < 0.30 && rr.activeCurses.length < 2) {
			const avail = CURSE_DEFS.filter(c => !rr.activeCurses.includes(c.id));
			if (avail.length > 0) rr.curseoffer = avail[Math.floor(rand() * avail.length)];
		}

		rr.rerollCount = 0;
		Game.renderShop();
		document.getElementById('shop-overlay').style.display = 'flex';
	},

	renderShop: function () {
		const rr  = Game.rogueRun;
		const cfg = ZONE_CONFIG[rr.anteIndex];
		document.getElementById('shop-title').innerText =
			`${cfg.label} クリア！ 🛒 レリックショップ`;
		document.getElementById('shop-coins-display').innerText = `🪙 ${rr.coins}`;

		const nextCfg   = ZONE_CONFIG[rr.anteIndex + 1];
		const nextLabel = nextCfg ? `次: ${nextCfg.label} 目標${nextCfg.target}pts` : '';
		document.getElementById('shop-skip-btn').innerText =
			nextCfg ? `${nextCfg.label} へ →  (${nextLabel})` : '次の Zone へ →';

		// Re-roll button (hidden during boss shop)
		const rerollEl = document.getElementById('shop-reroll-btn');
		if (rerollEl) {
			if (rr.isBossShop) {
				rerollEl.style.display = 'none';
			} else {
				rerollEl.style.display = '';
				const rerollCost = rr.rerollCount === 0 ? 0 : (rr.zone === 1 ? 20 : rr.zone === 2 ? 25 : 30);
				rerollEl.innerText = rr.rerollCount === 0 ? '🔄 Reroll (無料)' : `🔄 Reroll (🪙${rerollCost})`;
				rerollEl.disabled  = rr.coins < rerollCost;
			}
		}

		// ── BOSS SHOP: show treasure chests ──────────────────
		if (rr.isBossShop) {
			const offersEl = document.getElementById('shop-offers');
			if (!rr.bossChestDone) {
				offersEl.innerHTML = `
					<div class="boss-chest-title">🎁 ボスレリックチェスト<br><small style="font-weight:400;font-size:12px">1つだけ選べます</small></div>
					<div class="boss-chest-row">
						<div class="boss-chest" data-chest="rare">
							<div class="chest-icon">📦</div>
							<div class="chest-label">レア</div>
							<div class="chest-chance">75%</div>
						</div>
						<div class="boss-chest" data-chest="epic">
							<div class="chest-icon">💼</div>
							<div class="chest-label">エピック</div>
							<div class="chest-chance">50%</div>
						</div>
						<div class="boss-chest" data-chest="legendary">
							<div class="chest-icon">👑</div>
							<div class="chest-label">レジェンダリー</div>
							<div class="chest-chance">25%</div>
						</div>
					</div>`;
				offersEl.querySelectorAll('.boss-chest').forEach(el => {
					el.addEventListener('click', () => Game.openBossChest(el.dataset.chest));
				});
			}
			// Purge & curse hidden in boss shop
			const purgeSection = document.getElementById('shop-purge-section');
			if (purgeSection) purgeSection.innerHTML = '';
			const curseSection = document.getElementById('shop-curse-section');
			if (curseSection) curseSection.innerHTML = '';
			document.getElementById('shop-sell-slots').style.display = 'none';
			return;
		}

		// ── NORMAL SHOP ───────────────────────────────────────
		// Restore visibility in case we came from a boss shop
		document.getElementById('shop-sell-slots').style.display = '';

		const rarityLabel = {
			common: 'コモン', uncommon: 'アンコモン', rare: 'レア',
			epic: 'エピック', legendary: 'レジェンダリー'
		};

		// Hermit arcana: first offer is free
		const hermitActive = rr.arcana && rr.arcana.id === 'hermit' && !rr.arcanaState.hermitUsed;
		// Sale30 event: relics 30% off
		const saleActive   = rr.activeEvent && rr.activeEvent.type === 'sale30';

		document.getElementById('shop-offers').innerHTML = rr.shopOffers.every(r => !r)
			? '<div class="lb-empty">購入可能なレリックがありません</div>'
			: rr.shopOffers.map((r, i) => {
				// null = already purchased this shop phase → show greyed sold card
				if (!r) {
					return `<div class="joker-card sold" style="opacity:0.45;pointer-events:none;">
						<div class="joker-card-emoji">✅</div>
						<div class="joker-card-info">
							<div class="joker-card-name">購入済み</div>
						</div>
						<button class="joker-buy-btn" disabled>購入済み</button>
					</div>`;
				}
				const isFree    = hermitActive && i === 0;
				const baseCost  = saleActive ? Math.ceil(r.cost * 0.7) : r.cost;
				const effCost   = isFree ? 0 : baseCost;
				const canAfford = rr.coins >= effCost;
				const isFull    = rr.relics.length >= 7;
				const disabled  = (!canAfford || isFull) ? 'disabled' : '';
				const saleBadge = saleActive && !isFree ? ` <small style="color:#ffd700">-30%</small>` : '';
				const reason    = isFull ? 'スロット満杯' : isFree ? '🎁 無料' : `🪙 ${effCost}${saleBadge}`;
				return `<div class="joker-card rarity-${r.rarity}">
					<div class="joker-card-emoji">${r.emoji}</div>
					<div class="joker-card-info">
						<div class="joker-card-name">${r.name}
							<span class="joker-rarity-badge ${r.rarity}">${rarityLabel[r.rarity]}</span>
						</div>
						<div class="joker-card-desc">${r.desc}</div>
					</div>
					<button class="joker-buy-btn" data-shop-idx="${i}" data-eff-cost="${effCost}" ${disabled}>${reason}</button>
				</div>`;
			}).join('');

		// Curse offer section
		const curseSection = document.getElementById('shop-curse-section');
		if (curseSection) {
			if (rr.curseoffer) {
				const c = rr.curseoffer;
				const reward = c.coinBonus
					? `🪙+${c.coinBonus}`
					: c.scoreBuff ? `スコアボーナス+${Math.round(c.scoreBuff * 100)}%` : '';
				curseSection.innerHTML = `
					<div style="background:rgba(80,0,80,0.15);border:2px solid #9b59b6;border-radius:12px;padding:12px 14px">
						<div style="font-size:13px;font-weight:900;color:#9b59b6;margin-bottom:6px">${c.emoji} 呪いの提案 <span style="font-size:10px;color:var(--col-text-muted)">（任意）</span></div>
						<div style="font-size:12px;font-weight:700">${c.name}</div>
						<div style="font-size:11px;color:var(--col-text-muted);margin:4px 0">${c.desc}</div>
						<button id="shop-curse-accept-btn" style="margin-top:8px;font-family:inherit;font-size:12px;font-weight:700;padding:7px 16px;border-radius:10px;border:none;background:#9b59b6;color:#fff;cursor:pointer">呪いを受け入れる → ${reward}</button>
					</div>`;
				document.getElementById('shop-curse-accept-btn').addEventListener('click', () => Game.acceptCurse(c));
			} else {
				curseSection.innerHTML = '';
			}
		}

		// Purge Token (Hardroguerun only)
		const purgeSection = document.getElementById('shop-purge-section');
		if (purgeSection) {
			if (rr.persistent) {
				const purgeDisabled = (rr.purgeUsed || rr.coins < 90) ? 'disabled' : '';
				const purgeLabel    = rr.purgeUsed ? '✅ 使用済み' : '💣 爆破ボム（上から9個削除）🪙 90';
				purgeSection.innerHTML = `<button id="shop-purge-btn" ${purgeDisabled}>${purgeLabel}</button>`;
				const purgeBtn = document.getElementById('shop-purge-btn');
				if (purgeBtn) purgeBtn.addEventListener('click', () => Game.usePurgeToken());
			} else {
				purgeSection.innerHTML = '';
			}
		}

		// Owned relics (for sell in Hardroguerun)
		const sellSlots = document.getElementById('shop-sell-slots');
		if (sellSlots) {
			if (rr.persistent && rr.relics.length > 0) {
				sellSlots.style.display = 'block';
				const rarLabel = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー' };
				sellSlots.innerHTML = `<div class="shop-sell-title">💸 売却（2回タップで確定・35%還元）</div>` +
					rr.relics.map((r, idx) => {
						const refund     = Math.ceil(r.cost * 0.35);
						const isPending  = rr.sellPending === idx;
						return `<div class="shop-sell-item rarity-${r.rarity} ${isPending ? 'sell-pending' : ''}" data-sell-idx="${idx}">
							<span>${r.emoji}</span>
							<span class="shop-sell-name">${r.name}</span>
							<span class="shop-sell-refund">${isPending ? '✅ もう一度タップで確定' : `売却: 🪙${refund}`}</span>
						</div>`;
					}).join('');
				sellSlots.querySelectorAll('.shop-sell-item').forEach(el => {
					el.addEventListener('click', () => Game.tapSellRelic(parseInt(el.dataset.sellIdx)));
				});
			} else {
				sellSlots.style.display = 'none';
			}
		}

		// Attach buy listeners
		document.querySelectorAll('.joker-buy-btn').forEach(btn => {
			btn.addEventListener('click', () => Game.buyRelic(parseInt(btn.dataset.shopIdx)));
		});
	},

	buyRelic: function (idx) {
		const rr = Game.rogueRun;
		const relic = rr.shopOffers[idx];
		if (!relic) return; // null = already purchased (greyed-out guard)

		const hermitFree = rr.arcana && rr.arcana.id === 'hermit' && !rr.arcanaState.hermitUsed && idx === 0;
		const saleActive = rr.activeEvent && rr.activeEvent.type === 'sale30';
		const baseCost   = saleActive ? Math.ceil(relic.cost * 0.7) : relic.cost;
		const cost       = hermitFree ? 0 : baseCost;

		if (rr.coins < cost || rr.relics.length >= 7) return;

		rr.coins -= cost;
		if (hermitFree) rr.arcanaState.hermitUsed = true;

		// Mark slot as sold before pushing so double-tap is impossible
		rr.shopOffers[idx] = null;
		rr.relics.push(relic);

		// Immediate activation effects
		if (relic.id === 'shield')   rr.shieldCharges += 1;
		if (relic.id === 'talisman') rr.shieldCharges += 3;

		// Check synergy activation
		const ownedIds = new Set(rr.relics.map(r => r.id));
		for (const syn of SYNERGY_DEFS) {
			const key = syn.relics.slice().sort().join('+');
			if (!rr.activeSynergies.includes(key) && syn.relics.every(id => ownedIds.has(id))) {
				rr.activeSynergies.push(key);
				// Immediate synergy effects
				if (syn.effect === 'shield_bonus') rr.shieldCharges += (syn.bonus || 0);
				Game.showCelebration(`${syn.emoji} シナジー発動: ${syn.name}！`);
			}
		}

		Game.renderShop();
		Game.updateRogueHud();
	},

	openBossChest: function (rarity) {
		const rr = Game.rogueRun;
		if (rr.bossChestDone) return;
		rr.bossChestDone = true;

		// Grey out all chests; highlight chosen one
		document.querySelectorAll('.boss-chest').forEach(el => {
			el.classList.add(el.dataset.chest === rarity ? 'selected' : 'disabled');
		});

		const chances = { rare: 0.75, epic: 0.50, legendary: 0.25 };
		const success = Math.random() < (chances[rarity] || 0);
		const offersEl = document.getElementById('shop-offers');

		if (success) {
			const pool     = BOSS_RELIC_DEFS[rarity] || [];
			const ownedIds = rr.relics.map(r => r.id);
			const avail    = pool.filter(r => !ownedIds.includes(r.id));
			if (avail.length > 0) {
				const relic = avail[Math.floor(rand() * avail.length)];
				rr.relics.push(relic);
				// Immediate relic effects
				if (relic.id === 'boss_reroll')       rr.rerollCharges = -1;   // unlimited
				if (relic.id === 'boss_reroll_stock') rr.rerollCharges = 3;    // 3 charges
				if (relic.id === 'boss_shrink') {
					// Immediately shrink all existing fruits
					Composite.allBodies(engine.world).forEach(b => {
						if (!b.isStatic && typeof b.sizeIndex === 'number') {
							Matter.Body.scale(b, 0.8, 0.8);
							b._radius = (b._radius || b.circleRadius || Game.fruitSizes[b.sizeIndex].radius) * 0.8;
						}
					});
				}
				const rarLabels = { rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー' };
				offersEl.insertAdjacentHTML('beforeend', `
					<div style="margin-top:12px;text-align:center;padding:12px;background:rgba(255,215,0,0.1);border:2px solid #FFD700;border-radius:12px">
						<div style="font-size:28px">${relic.emoji}</div>
						<div style="font-weight:900">${relic.name}
							<span style="font-size:10px;background:#FFD700;color:#333;padding:2px 6px;border-radius:6px;margin-left:4px">${rarLabels[rarity]}</span>
						</div>
						<div style="font-size:11px;color:var(--col-text-muted);margin-top:4px">${relic.desc}</div>
						<div style="color:#FFD700;font-weight:700;margin-top:6px">🎉 ボスレリック獲得！</div>
					</div>`);
				Game.updateRogueHud();
				return;
			}
		}
		// Failure
		offersEl.insertAdjacentHTML('beforeend', `
			<div style="margin-top:12px;text-align:center;padding:12px;opacity:0.6">
				💨 何も出ませんでした…
			</div>`);
	},

	acceptCurse: function (curse) {
		const rr = Game.rogueRun;
		if (!curse || rr.activeCurses.includes(curse.id)) return;
		rr.activeCurses.push(curse.id);
		rr.curseoffer = null;

		// Coin reward
		if (curse.coinBonus) rr.coins += curse.coinBonus;

		// Immediate effects
		if (curse.id === 'curse_gravity') {
			engine.gravity.y *= 1.5;
		}

		Game.showCelebration(`😈 ${curse.name} を受け入れた！`);
		Game.renderShop();
		Game.updateRogueHud();
	},

	rerollCurrentFruit: function () {
		const rr = Game.rogueRun;
		if (rr.rerollCharges === -999) return; // no relic
		if (rr.rerollCharges === 0) return;    // out of charges (counted mode)
		if (Game.stateIndex !== GameStates.READY) return;

		// Decrement charges (-1 = unlimited, stays -1)
		if (rr.rerollCharges > 0) rr.rerollCharges--;

		// Randomise next fruit size (avoids current size if possible)
		let newSize;
		for (let tries = 0; tries < 8; tries++) {
			newSize = Math.floor(rand() * 5);
			if (newSize !== Game.nextFruitSize) break;
		}
		if (rr.activeCurses && rr.activeCurses.includes('curse_size')) newSize = Math.min(newSize, 3);
		Game.nextFruitSize = newSize;
		Game.elements.nextFruitImg.src = `./assets/img/circle${newSize}.png`;
		Game.updateRogueHud();
		// Update reroll button label
		const btn = document.getElementById('btn-reroll-fruit');
		if (btn) {
			btn.innerText = rr.rerollCharges === -1
				? '🔄 次を交換'
				: rr.rerollCharges > 0
					? `🔄 次を交換 (${rr.rerollCharges})`
					: '🔄 交換不可';
			btn.disabled = rr.rerollCharges === 0;
		}
	},

	rerollShop: function () {
		const rr = Game.rogueRun;
		const cost = rr.rerollCount === 0 ? 0 : (rr.zone === 1 ? 20 : rr.zone === 2 ? 25 : 30);
		if (rr.coins < cost) return;
		rr.coins -= cost;
		rr.rerollCount++;
		// Regenerate offers (same logic as showShop)
		const ownedIds = rr.relics.map(r => r.id);
		const shopOfferIds = new Set(rr.shopOffers.filter(r => r).map(r => r.id));
		const available = RELIC_DEFS.filter(r =>
			!ownedIds.includes(r.id) &&
			!shopOfferIds.has(r.id) &&
			rr.zone >= (MIN_ZONE_FOR_RARITY[r.rarity] || 1)
		);
		const rarityWeight = { common: 5, uncommon: 4, rare: 3, epic: 2, legendary: 1 };
		const pool = [];
		available.forEach(r => {
			const w = rarityWeight[r.rarity] || 1;
			for (let i = 0; i < w; i++) pool.push(r);
		});
		rr.shopOffers = [];
		const tempPool = [...pool];
		const seen = new Set();
		while (rr.shopOffers.length < Math.min(3, available.length) && tempPool.length > 0) {
			const idx = Math.floor(rand() * tempPool.length);
			const relic = tempPool.splice(idx, 1)[0];
			if (!seen.has(relic.id)) { seen.add(relic.id); rr.shopOffers.push(relic); }
		}
		Game.renderShop();
		Game.updateRogueHud();
	},

	startNextAnte: function () {
		document.getElementById('shop-overlay').style.display = 'none';

		// ノーマル: 盤面クリア / ハード: フルーツを残す
		if (!Game.rogueRun.persistent) {
			const bodies = Composite.allBodies(engine.world).filter(b => !b.isStatic);
			Composite.remove(engine.world, bodies);
		}

		// Reset per-ante event/curse state
		Game.rogueRun.activeEvent = null;
		Game.rogueRun.curseoffer  = null;

		// Reset per-ante state
		Game.rogueRun.anteIndex++;
		Game.combo           = 0;
		Game.maxComboReached = 0;

		if (Game.rogueRun.keepScore) {
			// ノーマル・ハード共通: スコアは累積。anteScoreBbaseを更新して差分計算に使う
			Game.rogueRun.anteScoreBase = Game.score;
		} else {
			// ローグラン以外のモード用フォールバック（通常はここに来ない）
			Game.score        = 0;
			Game.extraPoints  = 0;
			Game.fruitsMerged = new Array(Game.fruitSizes.length).fill(0);
		}
		Game.calculateScore();

		// Apply new zone/ante config
		Game.applyZoneAnteConfig();

		// Reset preview ball
		if (Game.elements.previewBall) {
			Composite.remove(engine.world, Game.elements.previewBall);
		}
		Game.currentFruitSize = Math.floor(rand() * 3); // fresh start size
		Game.setNextFruitSize();
		Game.updateCurrentFruitDisplay();
		Game.elements.previewBall = Game.generateFruitBody(
			Game.width / 2, previewBallHeight, Game.currentFruitSize,
			{ isStatic: true }
		);
		Composite.add(engine.world, Game.elements.previewBall);

		// ハードモード: 上限を超えているフルーツを安全に削除してからAnteを開始
		if (Game.rogueRun.persistent) {
			const overLimit = Composite.allBodies(engine.world).filter(
				b => !b.isStatic && (b.position.y - (b.circleRadius || 0)) < loseHeight + 20
			);
			if (overLimit.length) Composite.remove(engine.world, overLimit);
			Game.rogueRun.anteStartTime = performance.now();
		}

		// Resume
		physicsEnabled = true;
		Game.stateIndex = GameStates.READY;
		Game.elements.comboDisplay.style.display = 'none';
	},

	// per-merge relic effects: returns bonus score earned
	applyRelicMergeEffect: function (sizeIndex, midX, midY) {
		const rr = Game.rogueRun;
		if (!rr.active || rr.relics.length === 0) return 0;

		let bonusScore = 0;
		let bonusCoins = 0;
		const baseScore = Game.fruitSizes[sizeIndex].scoreValue;

		rr.mergeCount++;

		for (const relic of rr.relics) {
			switch (relic.id) {
				// ── COMMON ──
				case 'coin_magnet':
					bonusCoins += 2;
					break;
				case 'triple_merge':
					if (sizeIndex <= 2) bonusCoins += 3;
					break;
				case 'size_down_pts':
					if (sizeIndex === 1) bonusScore += 15;
					break;
				case 'moon':
					bonusScore += 5;
					break;
				// ── UNCOMMON ──
				case 'big_score':
					if (sizeIndex >= 4) bonusScore += 25;
					break;
				case 'diamond':
					bonusScore += 10;
					break;
				case 'rebirth':
					if (Math.random() < 0.15 && sizeIndex < Game.fruitSizes.length - 1) {
						setTimeout(() => {
							if (Game.stateIndex !== GameStates.LOSE && Game.stateIndex !== GameStates.SHOP) {
								Composite.add(engine.world, Game.generateFruitBody(midX, midY - 30, 0));
							}
						}, 220);
					}
					break;
				// ── RARE ──
				case 'golden7':
					if (sizeIndex >= 6) bonusScore += baseScore * 2; // total ×3
					break;
				case 'gravity_heavy':
					bonusCoins += 1;
					break;
				case 'lightning':
					if (sizeIndex === 2 || sizeIndex === 3) bonusCoins += 4;
					break;
				// ── EPIC ──
				case 'trident':
					if (sizeIndex >= 1) bonusCoins += 5;
					break;
				case 'rainbow':
					if (Math.random() < 0.20) bonusScore += baseScore * 2; // total ×3
					break;
				case 'meteor':
					if (rr.mergeCount % 5 === 0) {
						const mx = midX + (Math.random() - 0.5) * 200;
						setTimeout(() => {
							if (Game.stateIndex !== GameStates.LOSE && Game.stateIndex !== GameStates.SHOP) {
								Composite.add(engine.world, Game.generateFruitBody(Math.max(50, Math.min(Game.width - 50, mx)), 60, 1));
							}
						}, 300);
					}
					break;
				// ── LEGENDARY ──
				case 'cosmos':
					bonusScore += baseScore; // total ×2
					break;
			}
		}

		// ── Synergy effects ──
		for (const syn of SYNERGY_DEFS) {
			const key = syn.relics.slice().sort().join('+');
			if (!rr.activeSynergies.includes(key)) continue;
			switch (syn.effect) {
				case 'extra_coins':
					bonusCoins += (syn.bonus || 1);
					break;
				case 'combo_x2':
					bonusScore += Math.floor(Game.fruitSizes[sizeIndex].scoreValue * (Game.combo - 1) * 0.4);
					break;
				case 'score_bonus':
					bonusScore += Math.round(baseScore * (syn.bonus || 0));
					break;
				case 'rebirth_plus':
					if (Math.random() < 0.05) {
						setTimeout(() => {
							if (Game.stateIndex !== GameStates.LOSE && Game.stateIndex !== GameStates.SHOP) {
								Composite.add(engine.world, Game.generateFruitBody(midX, midY - 30, 0));
							}
						}, 220);
					}
					break;
			}
		}

		// ── Active event effects ──
		if (rr.activeEvent) {
			if (rr.activeEvent.type === 'score2x') bonusScore += baseScore + bonusScore; // double total score
			if (rr.activeEvent.type === 'combo2x' && Game.combo > 1) {
				bonusScore += Math.floor(Game.fruitSizes[sizeIndex].scoreValue * (Game.combo - 1) * 0.4);
			}
		}

		// ── Curse score buff ──
		if (rr.activeCurses && rr.activeCurses.includes('curse_size')) {
			bonusScore += Math.round(baseScore * 0.20);
		}

		rr.coins += bonusCoins;
		return bonusScore;
	},

	// ── Arcana: draw one card per Ante ───────────────────────
	drawArcana: function () {
		const rr = Game.rogueRun;
		// Roll rarity
		const roll = Math.random();
		let rarity;
		if (roll < 0.60)      rarity = 'common';
		else if (roll < 0.90) rarity = 'uncommon';
		else                  rarity = 'rare';

		const pool = ARCANA_DEFS.filter(a => a.rarity === rarity);
		if (!pool.length) return;
		rr.arcana      = pool[Math.floor(rand() * pool.length)];
		rr.arcanaState = {};

		// Apply immediate effects
		const a = rr.arcana;
		if (a.id === 'fool') {
			rr.scoreTarget = Math.round(rr.scoreTarget * 0.8);
		}
		if (a.id === 'moon_arcana') {
			rr.arcanaState.moonReady = true; // next drop will be size 7
		}
		if (a.id === 'magician') {
			rr.arcanaState.magicianCount = 3; // 3 same-size drops remaining
			rr.arcanaState.magicianSize  = Game.currentFruitSize;
		}

		// Boss Ryuga (boss antes)
		const isBossAnte = (rr.anteInZone === 5);
		if (isBossAnte) {
			Game.startBossRyuga();
		}

		Game.showArcanaReveal(rr.arcana);
	},

	showArcanaReveal: function (arcana) {
		const el = document.getElementById('arcana-reveal');
		if (!el) return;
		document.getElementById('arcana-reveal-emoji').innerText = arcana.emoji;
		document.getElementById('arcana-reveal-name').innerText  = arcana.name;
		document.getElementById('arcana-reveal-desc').innerText  = arcana.desc;
		el.style.display = 'flex';
		clearTimeout(Game._arcanaTimer);
		Game._arcanaTimer = setTimeout(() => { el.style.display = 'none'; }, 3200);
	},

	_arcanaTimer: null,

	// Arcana per-merge hook (called inside applyRelicMergeEffect flow)
	applyArcanaEffect: function (sizeIndex, midX, midY, isMaxMerge) {
		const rr = Game.rogueRun;
		if (!rr.arcana) return { score: 0, coins: 0 };
		const a   = rr.arcana;
		const st  = rr.arcanaState;
		const baseScore = Game.fruitSizes[sizeIndex].scoreValue;
		let bonus = { score: 0, coins: 0 };

		switch (a.id) {
			case 'high_priestess':
				if (Math.random() < 0.15) bonus.coins += 3;
				break;
			case 'emperor':
				bonus.score += Math.round(baseScore * 0.5); // +0.5x = total 1.5x
				break;
			case 'tower':
				if (isMaxMerge) bonus.score += baseScore * 2; // total ×3
				break;
			case 'star':
				if (rr.mergeCount % 5 === 0) {
					const sx = midX;
					setTimeout(() => {
						if (Game.stateIndex !== GameStates.LOSE && Game.stateIndex !== GameStates.SHOP) {
							for (let i = 0; i < 3; i++) {
								const x = Math.max(80, Math.min(Game.width - 80, sx + (i - 1) * 100));
								Composite.add(engine.world, Game.generateFruitBody(x, 60, 1));
							}
						}
					}, 300);
				}
				break;
		}
		return bonus;
	},

	// Call when Ante clears — handle world arcana coin bonus
	applyArcanaOnClear: function () {
		const rr = Game.rogueRun;
		if (!rr.arcana) return;
		if (rr.arcana.id === 'world') {
			rr.coins += 100;
			Game.showCelebration('🌍 The World 発動！ コイン+100！');
		}
	},

	// ── Boss Ryuga ────────────────────────────────────────────
	bossRyuga: {
		active:       false,
		timeTimer:    null,
		enemyTexture: null, // 丸くクリップした画像のdataURL（キャッシュ）
	},

	startBossRyuga: function () {
		const rr = Game.rogueRun;
		const br = Game.bossRyuga;
		br.active = true;

		// ゾーンごとの敵サイズ: Zone1=size0, Zone2=size1, Zone3=size2
		const enemySize = rr.zone - 1;

		// 背景オーバーレイ表示
		const overlay = document.getElementById('boss-ryuga-overlay');
		if (overlay) overlay.style.display = 'block';
		const indicator = document.getElementById('boss-ryuga-indicator');
		if (indicator) indicator.style.display = 'flex';

		// 投下通知を出してからスポーン
		const doSpawn = () => {
			if (!br.active) return;
			if (Game.stateIndex === GameStates.LOSE || Game.stateIndex === GameStates.SHOP) return;

			// 「小デスリュウガ 投下！」通知
			Game.showBossSpawnAlert();

			const count = (rr.arcana && rr.arcana.id === 'devil') ? 4 : 2;
			setTimeout(() => {
				if (!br.active) return;
				for (let i = 0; i < count; i++) {
					const x = Math.max(80, Math.min(Game.width - 80, 100 + rand() * (Game.width - 200)));
					Composite.add(engine.world, Game.generateBossEnemyBody(x, 60, enemySize));
				}
			}, 800); // 通知表示後にスポーン
		};

		// 画像を丸くクリップしてからスポーン開始
		Game.prepareBossEnemyTexture(() => {
			// 最初の投下 (2秒後)
			setTimeout(doSpawn, 2000);
			// 以降30秒ごと
			br.timeTimer = setInterval(doSpawn, 30000);
		});
	},

	showBossSpawnAlert: function () {
		const el = document.getElementById('boss-spawn-alert');
		if (!el) return;
		el.style.animation = 'none';
		el.offsetHeight; // reflow でアニメーションリセット
		el.style.display = 'block';
		el.style.animation = 'bossSpawnFade 1.8s ease forwards';
		clearTimeout(Game._bossAlertTimer);
		Game._bossAlertTimer = setTimeout(() => { el.style.display = 'none'; }, 1900);
	},
	_bossAlertTimer: null,

	checkBossRyugaMerge: function () {
		// 合体フックは維持（将来の拡張用）
	},

	stopBossRyuga: function () {
		const br = Game.bossRyuga;
		br.active = false;
		clearInterval(br.timeTimer);
		br.timeTimer = null;

		// 背景・インジケーター非表示
		const overlay = document.getElementById('boss-ryuga-overlay');
		if (overlay) overlay.style.display = 'none';
		const indicator = document.getElementById('boss-ryuga-indicator');
		if (indicator) indicator.style.display = 'none';

		// bossEnemy ラベルの全フルーツ消滅
		const enemies = Composite.allBodies(engine.world).filter(b => b.label === 'bossEnemy');
		if (enemies.length) Composite.remove(engine.world, enemies);

		// ボーナス
		Game.extraPoints += 150;
		Game.calculateScore();
		Game.showCelebration('✨ デスリュウガ撃破！ +150pts ✨');
	},

	// ── 爆破ボム ──────────────────────────────────────────────
	usePurgeToken: function () {
		const rr = Game.rogueRun;
		if (rr.purgeUsed) { Game.showCelebration('⚠️ このAnteはすでに使用済み'); return; }
		if (rr.coins < 90) { Game.showCelebration('⚠️ コインが足りない'); return; }
		rr.coins -= 90;
		rr.purgeUsed = true;

		// 危険ライン優先（y座標小さい＝上にある＝危険）でフルーツを9個削除
		const bodies = Composite.allBodies(engine.world)
			.filter(b => !b.isStatic)
			.sort((a, b) => a.position.y - b.position.y);

		const toRemove = bodies.slice(0, 9);
		if (toRemove.length) Composite.remove(engine.world, toRemove);
		Game.showCelebration(`💣 爆破ボム発動！ ${toRemove.length}個削除！`);
		Game.renderShop();
		Game.updateRogueHud();
	},

	// ── Relic Sell (Hardroguerun only) ────────────────────────
	tapSellRelic: function (relicIdx) {
		const rr = Game.rogueRun;
		if (!rr.persistent) return; // Hardroguerun only
		const relic = rr.relics[relicIdx];
		if (!relic) return;

		if (rr.sellPending === relicIdx) {
			// Second tap: confirm sell
			const refund = Math.ceil(relic.cost * 0.35);
			rr.relics.splice(relicIdx, 1);
			rr.coins += refund;
			rr.sellPending = null;
			Game.showCelebration(`💸 ${relic.emoji} 売却！ コイン+${refund}`);
			Game.renderShop();
			Game.updateRogueHud();
		} else {
			// First tap: show confirmation
			rr.sellPending = relicIdx;
			const refund = Math.ceil(relic.cost * 0.35);
			Game.renderShop(); // re-render to show confirm state
		}
	},

	endRogueRun: function (won) {
		const rr = Game.rogueRun;
		rr.active = false;
		engine.gravity.y = 1;                // reset gravity

		const total = rr.totalScore;
		const cfg   = ZONE_CONFIG[Math.min(rr.anteIndex, 14)];

		// Reuse game-end modal
		if (won) {
			Game.elements.endTitle.innerText = '👑 全Zone制覇！ 伝説の勇者！';
		} else {
			Game.elements.endTitle.innerText = `${cfg.label} で力尽きた…`;
		}
		Game.elements.endScoreDisplay.innerText = `総スコア: ${total}点`;

		const cr = Game.elements.endChallengeResult;
		cr.style.display = 'inline-block';
		cr.className = '';
		cr.id = 'game-end-challenge-result';
		cr.classList.add(won ? 'success' : 'fail');
		const relicNames = rr.relics.map(r => r.emoji).join('') || 'なし';
		cr.innerText = `✨ ${rr.relics.length}個のレリック: ${relicNames}`;

		Game.renderStats();

		// Restore normal status bar
		document.getElementById('game-status').style.display = 'flex';
		document.getElementById('rogue-status').style.display = 'none';

		Game.elements.end.style.display = 'flex';
		setTimeout(() => { Game.elements.playerNameInput.focus(); }, 100);
	},

	// ── Init ──────────────────────────────────────────────
	initGame: function () {
		Render.run(render);
		Composite.add(engine.world, menuStatics);

		Game.loadHighscore();
		Game.loadSettings();
		Game.loadAllLeaderboards();

		Game.elements.ui.style.display = 'none';
		Game.fruitsMerged = new Array(Game.fruitSizes.length).fill(0);

		// ── Menu mode selector ──
		const ROGUE_MODES = ['roguerun', 'hardroguerun'];

		const syncModeBtns = (mode) => {
			// 通常ボタン（data-mode持ち）
			document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
				btn.classList.toggle('active', btn.dataset.mode === mode);
			});
			// ローグランカテゴリーボタン: ローグ系モードが選ばれていれば強調
			const catBtn   = document.getElementById('btn-category-roguerun');
			const submenu  = document.getElementById('roguerun-submenu');
			const isRogue  = ROGUE_MODES.includes(mode);
			if (catBtn)  catBtn.classList.toggle('category-open', isRogue);
			if (submenu) submenu.style.display = isRogue ? 'flex' : 'none';
		};

		syncModeBtns(Game.settings.gameMode);

		// ローグランカテゴリーボタン: クリックでモーダル表示
		const catBtn  = document.getElementById('btn-category-roguerun');
		const submenu = document.getElementById('roguerun-submenu');
		const rogueModal = document.getElementById('roguerun-modal');
		if (submenu) submenu.style.display = 'none'; // always hidden; use modal instead
		if (catBtn && rogueModal) {
			catBtn.addEventListener('click', () => {
				// Sync active card
				rogueModal.querySelectorAll('.rogue-mode-card').forEach(card => {
					card.classList.toggle('active', card.dataset.mode === Game.settings.gameMode);
				});
				rogueModal.style.display = 'flex';
			});
		}

		// ローグランモーダル: カード選択
		if (rogueModal) {
			rogueModal.querySelectorAll('.rogue-mode-card').forEach(card => {
				card.addEventListener('click', () => {
					Game.settings.gameMode = card.dataset.mode;
					syncModeBtns(card.dataset.mode);
					Game.saveSettings();
					rogueModal.querySelectorAll('.rogue-mode-card').forEach(c =>
						c.classList.toggle('active', c === card));
				});
			});
			document.getElementById('roguerun-modal-close').addEventListener('click', () => {
				rogueModal.style.display = 'none';
				// Ensure default roguerun is selected if no rogue mode chosen yet
				if (!ROGUE_MODES.includes(Game.settings.gameMode)) {
					Game.settings.gameMode = 'roguerun';
					syncModeBtns('roguerun');
					Game.saveSettings();
				}
			});
		}

		// サブモードボタン（mode-btn-sub, フォールバック）
		document.querySelectorAll('.mode-btn-sub').forEach(btn => {
			btn.addEventListener('click', () => {
				Game.settings.gameMode = btn.dataset.mode;
				syncModeBtns(btn.dataset.mode);
				Game.saveSettings();
			});
		});

		// 通常モードボタン（ローグ系以外）
		document.querySelectorAll('.mode-btn[data-mode]:not(.mode-btn-sub)').forEach(btn => {
			if (btn.id === 'btn-category-roguerun') return; // カテゴリーは上で処理済み
			btn.addEventListener('click', () => {
				if (!btn.dataset.mode) return;
				Game.settings.gameMode = btn.dataset.mode;
				syncModeBtns(btn.dataset.mode);
				Game.saveSettings();
			});
		});

		// ── Helper: get final score to save (roguerun uses totalScore) ──
		const isRogueMode = ['roguerun', 'hardroguerun'].includes(Game.settings.gameMode);
		const getFinalSaveScore = () => isRogueMode ? Game.rogueRun.totalScore : Game.score;

		// ── Helper: save to both local and online leaderboard ──
		const saveScores = async (name) => {
			const mode  = Game.settings.gameMode;
			const score = getFinalSaveScore();
			Game.saveToLeaderboard(name, score, mode);
			if (ONLINE_LB.enabled && score > 0) {
				await Game.saveToOnlineLeaderboard(name, score, mode);
			}
		};

		// ── Pause overlay helpers ──
		const showPauseConfirm = () => {
			const overlay = document.getElementById('pause-overlay');
			const confirm = document.getElementById('pause-confirm');
			const idle    = document.getElementById('pause-idle-msg');
			if (!overlay) return;
			if (confirm) confirm.style.display = 'block';
			if (idle)    idle.style.display    = 'none';
			overlay.style.display = 'flex';
		};
		const showPauseIdle = () => {
			const overlay = document.getElementById('pause-overlay');
			const confirm = document.getElementById('pause-confirm');
			const idle    = document.getElementById('pause-idle-msg');
			if (!overlay) return;
			if (confirm) confirm.style.display = 'none';
			if (idle)    idle.style.display    = 'block';
			overlay.style.display = 'flex';
		};

		// Pause confirm yes/no
		const confirmYes = document.getElementById('pause-confirm-yes');
		const confirmNo  = document.getElementById('pause-confirm-no');
		if (confirmYes) {
			confirmYes.addEventListener('click', async () => {
				if (Game.stateIndex === GameStates.LOSE) {
					await saveScores(Game.elements.playerNameInput.value);
				}
				window.location.reload();
			});
		}
		if (confirmNo) {
			confirmNo.addEventListener('click', () => {
				document.getElementById('pause-overlay').style.display = 'none';
				Game.resumeGame('home');
			});
		}

		// ── Home button (status bar) ──
		document.getElementById('btn-home').addEventListener('click', async function () {
			if (Game.stateIndex === GameStates.LOSE || Game.stateIndex === GameStates.MENU ||
			    Game.stateIndex === GameStates.SHOP) {
				if (Game.stateIndex === GameStates.LOSE) await saveScores(Game.elements.playerNameInput.value);
				window.location.reload();
				return;
			}
			Game.pauseGame('home');
			showPauseConfirm();
		});

		// ── Rogue home button ──
		document.getElementById('btn-rogue-home').addEventListener('click', () => {
			if (Game.stateIndex === GameStates.LOSE || Game.stateIndex === GameStates.SHOP) {
				window.location.reload();
				return;
			}
			Game.pauseGame('home');
			showPauseConfirm();
		});

		// ── Settings button in rogue status bar ──
		document.getElementById('btn-settings-rogue').addEventListener('click', () => {
			Game.pauseGame('settings');
			Game.elements.settingsOverlay.style.display = 'flex';
		});

		// ── "メニューへ" button in game-end modal ──
		document.getElementById('btn-go-menu').addEventListener('click', async function () {
			const name = Game.elements.playerNameInput.value;
			this.innerText = '保存中...'; this.disabled = true;
			await saveScores(name);
			window.location.reload();
		});

		// ── Settings panel events ──
		document.getElementById('btn-settings').addEventListener('click', () => {
			Game.pauseGame('settings');
			Game.elements.settingsOverlay.style.display = 'flex';
		});
		document.getElementById('settings-close').addEventListener('click', () => {
			Game.elements.settingsOverlay.style.display = 'none';
			Game.resumeGame('settings');
		});
		document.getElementById('bgm-volume').addEventListener('input', e => {
			Game.settings.bgmVolume = +e.target.value;
			document.getElementById('bgm-volume-label').innerText = Game.settings.bgmVolume + '%';
			Game.applySettings();
			Game.saveSettings();
		});
		document.getElementById('sfx-volume').addEventListener('input', e => {
			Game.settings.sfxVolume = +e.target.value;
			document.getElementById('sfx-volume-label').innerText = Game.settings.sfxVolume + '%';
			Game.applySettings();
			Game.saveSettings();
		});
		document.getElementById('dark-mode-toggle').addEventListener('change', e => {
			Game.settings.darkMode = e.target.checked;
			document.getElementById('dark-mode-label').innerText = Game.settings.darkMode ? 'ダーク' : 'ライト';
			Game.applyDarkMode(Game.settings.darkMode);
			Game.saveSettings();
		});

		// ── Leaderboard tab & mode state ──
		let currentLbTab  = 'local';
		let currentLbMode = 'normal';

		const refreshLeaderboard = () => {
			if (currentLbTab === 'local') {
				Game.renderLeaderboard(Game.leaderboards[currentLbMode] || []);
			} else {
				Game.showOnlineLeaderboard(currentLbMode);
			}
		};

		const setLbMode = (mode) => {
			currentLbMode = mode;
			document.querySelectorAll('.lb-mode-btn').forEach(b =>
				b.classList.toggle('active', b.dataset.lbmode === mode)
			);
			refreshLeaderboard();
		};

		// Mode tabs
		document.querySelectorAll('.lb-mode-btn').forEach(btn => {
			btn.addEventListener('click', () => setLbMode(btn.dataset.lbmode));
		});

		// Source tabs (local / online)
		document.getElementById('lb-tab-local').addEventListener('click', () => {
			currentLbTab = 'local';
			document.getElementById('lb-tab-local').classList.add('active');
			document.getElementById('lb-tab-online').classList.remove('active');
			refreshLeaderboard();
		});
		document.getElementById('lb-tab-online').addEventListener('click', () => {
			currentLbTab = 'online';
			document.getElementById('lb-tab-online').classList.add('active');
			document.getElementById('lb-tab-local').classList.remove('active');
			refreshLeaderboard();
		});

		// ── Open leaderboard (reset to local, auto-select current mode) ──
		const openLeaderboard = (forceMode) => {
			currentLbTab = 'local';
			document.getElementById('lb-tab-local').classList.add('active');
			document.getElementById('lb-tab-online').classList.remove('active');
			const mode = forceMode || Game.settings.gameMode;
			setLbMode(mode);
			Game.elements.leaderboardOverlay.style.display = 'flex';
		};
		document.getElementById('btn-leaderboard').addEventListener('click', () => openLeaderboard());
		document.getElementById('btn-show-leaderboard-end').addEventListener('click', () => openLeaderboard());
		document.getElementById('menu-lb-btn').addEventListener('click', () => {
			// game-ui is display:none on menu — show it temporarily so the overlay renders
			Game.elements.ui.style.display = 'block';
			openLeaderboard('normal');
		});
		document.getElementById('leaderboard-close').addEventListener('click', () => {
			Game.elements.leaderboardOverlay.style.display = 'none';
			// If we're still on the menu, hide game-ui again
			if (Game.stateIndex === GameStates.MENU) {
				Game.elements.ui.style.display = 'none';
			}
		});

		// ── Shop skip button ──
		document.getElementById('shop-skip-btn').addEventListener('click', () => {
			Game.startNextAnte();
		});
		document.getElementById('shop-reroll-btn').addEventListener('click', () => Game.rerollShop());

		// ── Reroll-fruit button (boss_reroll / boss_reroll_stock relics) ──
		const rerollFruitBtn = document.getElementById('btn-reroll-fruit');
		if (rerollFruitBtn) {
			rerollFruitBtn.addEventListener('click', () => Game.rerollCurrentFruit());
		}

		// ── Game-end events ──
		document.getElementById('game-end-restart').addEventListener('click', async function () {
			this.innerText = '保存中...'; this.disabled = true;
			await saveScores(Game.elements.playerNameInput.value);
			window.location.reload();
		});
		document.getElementById('stats-toggle').addEventListener('click', () => {
			const c = Game.elements.statsContent;
			const open = c.style.display !== 'none';
			c.style.display = open ? 'none' : 'block';
			document.getElementById('stats-toggle').innerText = open ? '📊 詳細統計を見る' : '📊 閉じる';
		});
		document.getElementById('btn-copy-score').addEventListener('click', () => {
			Game.copyScore();
			document.getElementById('btn-copy-score').innerText = '✅ コピーしました';
			setTimeout(() => { document.getElementById('btn-copy-score').innerText = '📋 スコアをコピー'; }, 2000);
		});
		document.getElementById('btn-screenshot').addEventListener('click', () => {
			Game.takeScreenshot();
		});

		// ── Tab visibility: pause when hidden, resume when visible ──
		document.addEventListener('visibilitychange', () => {
			const bgm = Game.sounds.backgroundMusic;
			if (document.hidden) {
				Game.pauseGame('tab');
				if (!bgm.paused) bgm.pause();
			} else {
				Game.resumeGame('tab');
				// BGM: resume if was playing
				if (
					Game.stateIndex !== GameStates.MENU &&
					Game.stateIndex !== GameStates.LOSE &&
					bgm.paused && !bgm.muted
				) {
					bgm.play().catch(() => {});
				}
			}
		});

		// ── Menu start ──
		const menuMouseDown = function () {
			if (!mouseConstraint.body || mouseConstraint.body.label !== 'btn-start') return;
			Events.off(mouseConstraint, 'mousedown', menuMouseDown);
			Game.startGame();
		};
		Events.on(mouseConstraint, 'mousedown', menuMouseDown);
	},

	// ── Start ─────────────────────────────────────────────
	startGame: function () {
		Game.sounds.click.play().catch(() => {});
		Game.sounds.backgroundMusic.loop = true;
		Game.sounds.backgroundMusic.play().catch(() => {});

		// Hide menu UI
		Game.elements.menuUi.style.display = 'none';

		Composite.remove(engine.world, menuStatics);
		Composite.add(engine.world, gameStatics);

		Game.extraPoints = 0;
		Game.combo = 0;
		Game.maxComboReached = 0;
		Game.challengesCleared = 0;
		Game.currentChallenge = null;
		Game.challengeCompleted = false;
		Game.calculateScore();

		Game.elements.ui.style.display = 'block';
		Game.elements.end.style.display = 'none';
		Game.elements.comboDisplay.style.display = 'none';
		Game.elements.challengeDisplay.style.display = 'none';
		Game.elements.timerDisplay.style.display = 'none';

		Game.elements.previewBall = Game.generateFruitBody(Game.width / 2, previewBallHeight, 0, { isStatic: true });
		Composite.add(engine.world, Game.elements.previewBall);
		Game.updateCurrentFruitDisplay();

		setTimeout(() => { Game.stateIndex = GameStates.READY; }, 250);

		// ── Mode-specific init ──
		if (Game.settings.gameMode === 'timeattack') {
			Game.startTimer();
		} else if (Game.settings.gameMode === 'challenge') {
			Game.pickChallenge();
		} else if (['roguerun', 'hardroguerun'].includes(Game.settings.gameMode)) {
			Game.startRogueRun();
		}

		// ── Drop guideline (afterRender canvas draw) ──
		Events.on(render, 'afterRender', function () {
			if (Game.stateIndex !== GameStates.READY) return;
			if (!Game.elements.previewBall) return;

			const ctx = render.context;
			const x = Game.elements.previewBall.position.x;
			const r = Game.fruitSizes[Game.currentFruitSize].radius;
			const startY = previewBallHeight + r;
			const endY   = Game.height - statusBarHeight - wallPad / 2;

			ctx.save();
			ctx.setLineDash([9, 7]);
			ctx.lineDashOffset = -(Date.now() / 60) % 16; // animated marching ants
			ctx.strokeStyle = 'rgba(255, 83, 0, 0.35)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x, startY);
			ctx.lineTo(x, endY);
			ctx.stroke();
			ctx.restore();
		});

		// ── Mouse events ──
		Events.on(mouseConstraint, 'mouseup', function (e) {
			// Bomb fruit tap detection
			const mx = e.mouse.position.x;
			const my = e.mouse.position.y;
			const bombHit = Composite.allBodies(engine.world).find(b => {
				if (!b.isBomb || b.popped) return false;
				const dx = b.position.x - mx;
				const dy = b.position.y - my;
				return Math.sqrt(dx * dx + dy * dy) < (b._radius || 36) + 8;
			});
			if (bombHit) {
				Game.explodeBomb(bombHit);
				return;
			}
			Game.addFruit(e.mouse.position.x);
		});

		Events.on(mouseConstraint, 'mousemove', function (e) {
			if (Game.stateIndex !== GameStates.READY) return;
			if (!Game.elements.previewBall) return;
			Game.elements.previewBall.position.x = e.mouse.position.x;
		});

		// ── Collision / merge ──
		Events.on(engine, 'collisionStart', function (e) {
			for (let i = 0; i < e.pairs.length; i++) {
				const { bodyA, bodyB } = e.pairs[i];

				if (bodyA.isStatic || bodyB.isStatic) continue;

				const rA = bodyA._radius || bodyA.circleRadius || 30;
				const rB = bodyB._radius || bodyB.circleRadius || 30;
				const aY = bodyA.position.y + rA;
				const bY = bodyB.position.y + rB;

				if (aY < loseHeight || bY < loseHeight) {
					Game.loseGame();
					return;
				}

				// 爆弾フルーツ接触: 폭발
				if (bodyA.isBomb || bodyB.isBomb) {
					const bomb = bodyA.isBomb ? bodyA : bodyB;
					setTimeout(() => Game.explodeBomb(bomb), 50);
					continue;
				}

				// お邪魔フルーツは合体不可
				if (bodyA.isBossEnemy || bodyB.isBossEnemy) continue;

				if (bodyA.sizeIndex !== bodyB.sizeIndex) continue;
				if (bodyA.sizeIndex === null || bodyB.sizeIndex === null) continue;
				if (bodyA.popped || bodyB.popped) continue;

				const sizeIndex = bodyA.sizeIndex;
				const isMaxSize = (sizeIndex === Game.fruitSizes.length - 1);

				const midX = (bodyA.position.x + bodyB.position.x) / 2;
				const midY = (bodyA.position.y + bodyB.position.y) / 2;
				const popR  = bodyA._radius || bodyA.circleRadius || 30;

				bodyA.popped = true;
				bodyB.popped = true;

				Game.fruitsMerged[sizeIndex] += 1;
				Game.sounds[`pop${sizeIndex}`].play();

				if (isMaxSize) {
					// 最大サイズ同士: スコア加算して消滅
					const scoreValue = Game.fruitSizes[sizeIndex].scoreValue;
					Game.extraPoints += scoreValue;

					Composite.remove(engine.world, [bodyA, bodyB]);
					Game.addPop(midX, midY, popR);
					Game.addScorePopup(midX, midY, sizeIndex);
					Game.handleCombo(sizeIndex);

					if (Game.rogueRun.active) {
						const rr = Game.rogueRun;
						// boss_blackhole: clear all fruits from board
						if (rr.relics.some(r => r.id === 'boss_blackhole')) {
							setTimeout(() => {
								const allFruits = Composite.allBodies(engine.world).filter(b => !b.isStatic && !b.isBossEnemy);
								if (allFruits.length) Composite.remove(engine.world, allFruits);
								Game.showCelebration('🕳️ ブラックホール！盤面消滅！');
							}, 100);
						}
						const relicBonus = Game.applyRelicMergeEffect(sizeIndex, midX, midY);
						if (relicBonus > 0) Game.extraPoints += relicBonus;
						const arcanaBonus = Game.applyArcanaEffect(sizeIndex, midX, midY, true);
						Game.extraPoints += arcanaBonus.score;
						Game.rogueRun.coins += 2 + arcanaBonus.coins;
						Game.checkBossRyugaMerge();
						Game.updateRogueHud();
					}

					Game.calculateScore();
					if (Game.settings.gameMode === 'challenge') Game.checkChallenge();
					Game.showCelebration('✨ 最大フルーツ合体！消滅！✨');
				} else {
					// 通常の合体: 次のサイズフルーツ生成
					let newSize = sizeIndex + 1;
					const rr = Game.rogueRun;

					// boss_skip: 15% chance skip one evolution
					if (rr.active && rr.relics.some(r => r.id === 'boss_skip')) {
						if (Math.random() < 0.15 && newSize + 1 < Game.fruitSizes.length - 1) {
							newSize++;
						}
					}

					const isMaxMerge = (newSize === Game.fruitSizes.length - 1);

					Composite.remove(engine.world, [bodyA, bodyB]);

					// boss_instant_max: if new fruit would be max size, remove instantly for score
					if (rr.active && rr.relics.some(r => r.id === 'boss_instant_max') && isMaxMerge) {
						const sv = Game.fruitSizes[newSize].scoreValue;
						Game.extraPoints += sv;
						Game.addPop(midX, midY, popR);
						Game.showCelebration('☄️ 極限消滅！ Max即時消滅！');
					} else {
						Composite.add(engine.world, Game.generateFruitBody(midX, midY, newSize));
					}

					Game.addPop(midX, midY, popR);
					Game.addScorePopup(midX, midY, sizeIndex);
					Game.handleCombo(sizeIndex);

					if (rr.active) {
						// boss_size7_clear: sizeIndex >= 6 removes all size0 fruits
						if (sizeIndex >= 6 && rr.relics.some(r => r.id === 'boss_size7_clear')) {
							const size0 = Composite.allBodies(engine.world).filter(
								b => !b.isStatic && b.sizeIndex === 0
							);
							if (size0.length) {
								Composite.remove(engine.world, size0);
								Game.showCelebration('💫 七星破壊！サイズ0を全消去！');
							}
						}

						const relicBonus = Game.applyRelicMergeEffect(sizeIndex, midX, midY);
						if (relicBonus > 0) Game.extraPoints += relicBonus;
						const arcanaBonus = Game.applyArcanaEffect(sizeIndex, midX, midY, false);
						Game.extraPoints += arcanaBonus.score;
						Game.rogueRun.coins += 2 + arcanaBonus.coins;
						Game.checkBossRyugaMerge();
						Game.updateRogueHud();
					}

					Game.calculateScore();
					if (Game.settings.gameMode === 'challenge') Game.checkChallenge();
					if (isMaxMerge && !rr.relics.some(r => r.id === 'boss_instant_max')) {
						Game.showCelebration('🎊 次は最大フルーツ！ 🎊');
					}
				}
			}
		});
	},

	addPop: function (x, y, r) {
		const circle = Bodies.circle(x, y, r, {
			isStatic: true,
			collisionFilter: { mask: 0x0040 },
			angle: rand() * (Math.PI * 2),
			render: {
				sprite: {
					texture: './assets/img/pop.png',
					xScale: r / 384,
					yScale: r / 384,
				}
			},
		});
		Composite.add(engine.world, circle);
		setTimeout(() => { Composite.remove(engine.world, circle); }, 100);
	},

	loseGame: function () {
		if (Game.stateIndex === GameStates.LOSE || Game.stateIndex === GameStates.SHOP) return;

		// ハードモード: Ante開始直後1.5秒間は猶予（フルーツが安定するまで）
		if (Game.rogueRun.active && Game.rogueRun.persistent &&
		    performance.now() - Game.rogueRun.anteStartTime < 1500) return;

		// ── boss_overtime: 5-second grace period (one-time) ────
		const rr = Game.rogueRun;
		if (rr.active && !rr._overtimeUsed && rr.relics.some(r => r.id === 'boss_overtime')) {
			rr._overtimeUsed = true;
			const el = document.getElementById('overtime-countdown');
			if (el) {
				el.style.display = 'block';
				let sec = 5;
				el.innerText = `⏳ ${sec}`;
				const tick = setInterval(() => {
					sec--;
					if (el) el.innerText = sec > 0 ? `⏳ ${sec}` : '';
					if (sec <= 0) {
						clearInterval(tick);
						if (el) el.style.display = 'none';
						Game.loseGame();
					}
				}, 1000);
			}
			return; // grace period in effect
		}

		// ── Shield charges (roguerun only) ──────────────────────
		if (Game.rogueRun.active && Game.rogueRun.shieldCharges > 0) {
			Game.rogueRun.shieldCharges--;
			// Remove fruits above lose line to prevent re-trigger
			const danger = Composite.allBodies(engine.world).filter(
				b => !b.isStatic && (b.position.y - (b.circleRadius || 0)) < loseHeight + 10
			);
			if (danger.length) Composite.remove(engine.world, danger);
			Game.updateRogueHud();
			const remaining = Game.rogueRun.shieldCharges;
			Game.showCelebration(`🛡️ 鉄壁発動！ 助かった！${remaining > 0 ? ` (残り${remaining}回)` : ''}`);
			return; // game continues
		}

		Game.stateIndex = GameStates.LOSE;
		physicsEnabled = false;

		// Stop BGM
		Game.sounds.backgroundMusic.pause();
		Game.sounds.backgroundMusic.currentTime = 0;

		// Stop timer if running
		if (Game.timerInterval) {
			clearInterval(Game.timerInterval);
			Game.timerInterval = null;
		}
		if (Game.comboTimer) clearTimeout(Game.comboTimer);

		Game.calculateScore();

		// ── Roguerun: use endRogueRun instead of normal end screen ──
		if (Game.rogueRun.active) {
			Game.rogueRun.totalScore += Game.score; // add partial ante score
			Game.rogueRun.active = false;
			engine.gravity.y = 1;
			Game.endRogueRun(false);
			return;
		}


		// Title & highscore
		if (Game.score > Game.cache.highscore) {
			Game.elements.endTitle.innerText = '🎉 新記録！';
			Game.saveHighscore();
		} else {
			Game.elements.endTitle.innerText = '人生やりなおせ';
		}

		Game.elements.endScoreDisplay.innerText = `スコア: ${Game.score}`;

		// Challenge result
		const cr = Game.elements.endChallengeResult;
		if (Game.settings.gameMode === 'challenge') {
			cr.style.display = 'inline-block';
			cr.className = '';
			cr.id = 'game-end-challenge-result';
			if (Game.challengesCleared > 0) {
				cr.classList.add('success');
				const emoji = Game.challengesCleared >= 5 ? '🏆' : Game.challengesCleared >= 3 ? '🎉' : '✅';
				cr.innerText = `${emoji} ${Game.challengesCleared}チャレンジクリア！`;
			} else {
				cr.classList.add('fail');
				cr.innerText = '❌ チャレンジ失敗…';
			}
		} else {
			cr.style.display = 'none';
		}

		// Stats
		Game.renderStats();

		Game.elements.end.style.display = 'flex';
		setTimeout(() => { Game.elements.playerNameInput.focus(); }, 100);
	},

	lookupFruitIndex: function (radius) {
		const idx = Game.fruitSizes.findIndex(s => s.radius === radius);
		if (idx === -1 || idx === Game.fruitSizes.length - 1) return null;
		return idx;
	},

	generateFruitBody: function (x, y, sizeIndex, extraConfig = {}) {
		const rr   = Game.rogueRun;
		const size = Game.fruitSizes[sizeIndex];
		const shrink = rr.active && rr.relics.some(r => r.id === 'boss_shrink');
		const square = rr.active && rr.relics.some(r => r.id === 'boss_square') && !extraConfig.isStatic;
		const actualRadius = shrink ? Math.round(size.radius * 0.8) : size.radius;
		const scale = actualRadius / 512;

		let body;
		if (square) {
			const side = actualRadius * 2;
			body = Bodies.rectangle(x, y, side, side, {
				...fruitPhysics,
				...extraConfig,
				render: { sprite: { texture: size.img, xScale: scale, yScale: scale } },
			});
		} else {
			body = Bodies.circle(x, y, actualRadius, {
				...fruitPhysics,
				...extraConfig,
				render: { sprite: { texture: size.img, xScale: scale, yScale: scale } },
			});
		}
		body.sizeIndex = sizeIndex;
		body._radius   = actualRadius;
		body.popped    = false;
		return body;
	},

	// ── 爆弾フルーツ生成（boss_bomb レリック） ──
	generateBombFruitBody: function (x, y) {
		const r = 36;
		const body = Bodies.circle(x, y, r, {
			...fruitPhysics,
			label: 'bombFruit',
			render: { fillStyle: '#cc2200', strokeStyle: '#ff6600', lineWidth: 3 },
		});
		body.isBomb    = true;
		body.sizeIndex = null;
		body._radius   = r;
		body.popped    = false;
		return body;
	},

	explodeBomb: function (bomb) {
		if (bomb.popped) return;
		bomb.popped = true;
		const bx = bomb.position.x;
		const by = bomb.position.y;
		const blastR = 120;
		const toRemove = [bomb];
		Composite.allBodies(engine.world).forEach(b => {
			if (b.isStatic || b === bomb) return;
			const dx = b.position.x - bx;
			const dy = b.position.y - by;
			if (Math.sqrt(dx * dx + dy * dy) < blastR) toRemove.push(b);
		});
		Composite.remove(engine.world, toRemove);
		Game.addPop(bx, by, blastR);
		Game.showCelebration('💥 爆発！');
	},

	// ── ボス敵フルーツ生成（合体不可・専用画像・丸くクリップ済み） ──
	generateBossEnemyBody: function (x, y, sizeIndex) {
		const size = Game.fruitSizes[sizeIndex];
		const texture = Game.bossRyuga.enemyTexture || './assets/img/boss-enemy.png';
		const circle = Bodies.circle(x, y, size.radius, {
			...fruitPhysics,
			label: 'bossEnemy',
			render: {
				sprite: {
					texture: texture,
					xScale: (size.radius * 2) / 1024,
					yScale: (size.radius * 2) / 1024,
				}
			},
		});
		circle.isBossEnemy = true; // 合体ロジックから除外するフラグ
		circle.sizeIndex   = null; // sizeIndex を null にして通常フルーツと一致しない
		circle.popped      = false;
		return circle;
	},

	// ── 画像を円形にクリップしてキャッシュ ──
	prepareBossEnemyTexture: function (callback) {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = function () {
			const D = 1024;
			const canvas = document.createElement('canvas');
			canvas.width = D; canvas.height = D;
			const ctx = canvas.getContext('2d');
			ctx.beginPath();
			ctx.arc(D / 2, D / 2, D / 2, 0, Math.PI * 2);
			ctx.closePath();
			ctx.clip();
			ctx.drawImage(img, 0, 0, D, D);
			Game.bossRyuga.enemyTexture = canvas.toDataURL('image/png');
			if (callback) callback();
		};
		img.onerror = function () {
			// フォールバック: 暗い赤色の💀マーク
			const D = 1024;
			const canvas = document.createElement('canvas');
			canvas.width = D; canvas.height = D;
			const ctx = canvas.getContext('2d');
			ctx.beginPath();
			ctx.arc(D / 2, D / 2, D / 2, 0, Math.PI * 2);
			ctx.clip();
			const grad = ctx.createRadialGradient(D/2, D/2, 0, D/2, D/2, D/2);
			grad.addColorStop(0, '#5a0000');
			grad.addColorStop(1, '#1a0000');
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, D, D);
			ctx.font = '900 480px serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = '#ff2222';
			ctx.fillText('💀', D / 2, D / 2 + 30);
			Game.bossRyuga.enemyTexture = canvas.toDataURL('image/png');
			if (callback) callback();
		};
		img.src = './assets/img/boss-enemy.png';
	},

	addFruit: function (x) {
		if (Game.stateIndex !== GameStates.READY) return;

		Game.sounds.click.play();
		Game.stateIndex = GameStates.DROP;

		const rr = Game.rogueRun;
		const hasBomb   = rr.active && rr.relics.some(r => r.id === 'boss_bomb');
		const hasDouble = rr.active && rr.relics.some(r => r.id === 'boss_double_drop');

		// boss_bomb: 15% chance spawn bomb fruit instead
		if (hasBomb && Math.random() < 0.15) {
			const bomb = Game.generateBombFruitBody(x, previewBallHeight);
			Composite.add(engine.world, bomb);
		} else {
			const latestFruit = Game.generateFruitBody(x, previewBallHeight, Game.currentFruitSize);
			Composite.add(engine.world, latestFruit);

			// boss_double_drop: 150ms later, second fruit slightly offset
			if (hasDouble) {
				const size2 = Game.currentFruitSize;
				const x2 = Math.max(50, Math.min(Game.width - 50, x + (Math.random() < 0.5 ? -50 : 50)));
				setTimeout(() => {
					if (Game.stateIndex !== GameStates.LOSE && Game.stateIndex !== GameStates.SHOP) {
						Composite.add(engine.world, Game.generateFruitBody(x2, previewBallHeight, size2));
					}
				}, 150);
			}
		}

		Game.currentFruitSize = Game.nextFruitSize;
		Game.setNextFruitSize();
		Game.updateCurrentFruitDisplay();
		Game.calculateScore();

		Composite.remove(engine.world, Game.elements.previewBall);
		Game.elements.previewBall = Game.generateFruitBody(
			render.mouse.position.x, previewBallHeight, Game.currentFruitSize,
			{ isStatic: true, collisionFilter: { mask: 0x0040 } }
		);

		setTimeout(() => {
			if (Game.stateIndex === GameStates.DROP) {
				Composite.add(engine.world, Game.elements.previewBall);
				Game.stateIndex = GameStates.READY;
			}
		}, 500);
	},
};

// ============================================================
// MATTER.JS SETUP
// ============================================================
const engine = Engine.create();
const runner = Runner.create();
const render = Render.create({
	element: Game.elements.canvas,
	engine,
	options: {
		width: Game.width,
		height: Game.height,
		wireframes: false,
		background: '#ffdcae',
	}
});

const menuStatics = [
	Bodies.rectangle(Game.width / 2, Game.height * 0.4, 512, 512, {
		isStatic: true,
		render: { sprite: { texture: './assets/img/bg-menu.png' } },
	}),
	...Array.from({ length: Game.fruitSizes.length }, (_, index) => {
		const x = (Game.width / 2) + 192 * Math.cos((Math.PI * 2 * index) / 12);
		const y = (Game.height * 0.4) + 192 * Math.sin((Math.PI * 2 * index) / 12);
		const r = 64;
		return Bodies.circle(x, y, r, {
			isStatic: true,
			render: { sprite: { texture: `./assets/img/circle${index}.png`, xScale: r / 1024, yScale: r / 1024 } },
		});
	}),
	Bodies.rectangle(Game.width / 2, Game.height * 0.75, 512, 96, {
		isStatic: true,
		label: 'btn-start',
		render: { sprite: { texture: './assets/img/btn-start.png' } },
	}),
];

const wallProps = {
	isStatic: true,
	render: { fillStyle: '#FFEEDB' },
	...friction,
};

const gameStatics = [
	Bodies.rectangle(-(wallPad / 2), Game.height / 2, wallPad, Game.height, wallProps),
	Bodies.rectangle(Game.width + (wallPad / 2), Game.height / 2, wallPad, Game.height, wallProps),
	Bodies.rectangle(Game.width / 2, Game.height + (wallPad / 2) - statusBarHeight, Game.width, wallPad,
		{ ...wallProps, label: 'floor' }),
];

const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
	mouse,
	constraint: { stiffness: 0.2, render: { visible: false } },
});
render.mouse = mouse;

Game.initGame();

// ============================================================
// 地面衝突時のバウンド抑制
// フルーツ同士はrestitution: 0.2で弾むが、地面だけy速度を殺す
// ============================================================
Events.on(engine, 'collisionStart', function (event) {
	event.pairs.forEach(pair => {
		const { bodyA, bodyB } = pair;
		const isFloor = b => b.label === 'floor';
		const isFruit = b => !b.isStatic;

		if (isFloor(bodyA) && isFruit(bodyB)) {
			Matter.Body.setVelocity(bodyB, { x: bodyB.velocity.x, y: 0 });
		} else if (isFloor(bodyB) && isFruit(bodyA)) {
			Matter.Body.setVelocity(bodyA, { x: bodyA.velocity.x, y: 0 });
		}
	});
});

// ============================================================
// FIXED-TIMESTEP PHYSICS LOOP
// Decouples physics from display refresh rate so fall speed is
// identical on 60 Hz, 90 Hz, 120 Hz and low-fps mobile devices.
// ============================================================
let physicsEnabled = true;
let lastPhysicsTime = null;
let physicsAccumulator = 0;
const PHYSICS_STEP = 1000 / 60;   // always simulate at 60 Hz

(function physicsLoop(timestamp) {
	requestAnimationFrame(physicsLoop);
	if (!physicsEnabled) { lastPhysicsTime = null; return; }
	if (lastPhysicsTime !== null) {
		// Cap elapsed to 250 ms to avoid spiral-of-death after tab switches
		const elapsed = Math.min(timestamp - lastPhysicsTime, 250);
		physicsAccumulator += elapsed;
		while (physicsAccumulator >= PHYSICS_STEP) {
			Engine.update(engine, PHYSICS_STEP);
			physicsAccumulator -= PHYSICS_STEP;
		}
	}
	lastPhysicsTime = timestamp;
})(performance.now());

// ============================================================
// RESIZE
// ============================================================
const resizeCanvas = () => {
	const sw = document.body.clientWidth;
	const sh = document.body.clientHeight;

	let newW, newH, scaleUI;
	if (sw * 1.5 > sh) {
		newH    = Math.min(Game.height, sh);
		newW    = newH / 1.5;
		scaleUI = newH / Game.height;
	} else {
		newW    = Math.min(Game.width, sw);
		newH    = newW * 1.5;
		scaleUI = newW / Game.width;
	}

	render.canvas.style.width  = `${newW}px`;
	render.canvas.style.height = `${newH}px`;

	Game.elements.ui.style.width     = `${Game.width}px`;
	Game.elements.ui.style.height    = `${Game.height}px`;
	Game.elements.ui.style.transform = `scale(${scaleUI})`;

	Game.elements.menuUi.style.width     = `${Game.width}px`;
	Game.elements.menuUi.style.height    = `${Game.height}px`;
	Game.elements.menuUi.style.transform = `scale(${scaleUI})`;
};

document.body.onload   = resizeCanvas;
document.body.onresize = resizeCanvas;
