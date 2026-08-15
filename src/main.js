// src/main.js — bootstrap. Creates the App, applies appearance, starts.
import { App } from './app.js';

const app = new App();
app.init().catch((e) => console.error('init failed', e));

// expose for debugging / workbench probing
window.__solitaire = app;