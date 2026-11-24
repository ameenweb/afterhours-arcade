/**
 * AFTERHOURS bootstrap.
 * Builds the persistence, audio, input, UI and game controller, then hands
 * control to the fixed-timestep loop.
 */
import { Storage } from './systems/Storage.js';
import { Achievements } from './systems/Achievements.js';
import { Skins } from './systems/Skins.js';
import { AudioManager } from './game/AudioManager.js';
import { InputManager } from './game/InputManager.js';
import { UIManager } from './ui/UIManager.js';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game');

if (!canvas) {
  throw new Error('AFTERHOURS: canvas element not found');
}

const storage = new Storage();
const achievements = new Achievements(storage);
const skins = new Skins(storage, achievements);

// Stat-based operatives (for example 10 lifetime runs) unlock at boot.
skins.evaluate();

const audio = new AudioManager(storage);
const input = new InputManager(storage.settings);
const ui = new UIManager({ storage, audio, achievements, skins, input });
const game = new Game({ canvas, ui, audio, storage, achievements, skins, input });

game.init();

// Small, documented handle for debugging and the headless smoke test.
window.__afterhours = { game, ui, storage, audio, achievements, skins, input };
