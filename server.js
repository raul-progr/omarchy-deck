const { exec } = require('child_process');
const express = require('express');
const path = require('path');
let OBSWebSocket = require('obs-websocket-js');

if (OBSWebSocket && OBSWebSocket.default) {
  OBSWebSocket = OBSWebSocket.default;
}

const obs = new OBSWebSocket();
const app = express();

let minX = 0, maxX = 5760;
let minY = 1080, maxY = 2160; // Valores por defecto
let currentMouseX = 2880; // Centro horizontal (5760 / 2)
let currentMouseY = 1620; // Centro vertical real (1080 + 540)

const OBS_HOST = process.env.OBS_HOST || '127.0.0.1';
const OBS_PORT = parseInt(process.env.OBS_PORT, 10) || 4455;
const OBS_PASSWORD = process.env.OBS_PASSWORD || '';
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_HOST = '0.0.0.0';

const log = (...args) => console.log('[OBS-BACKEND]', ...args);

function updateMonitorBounds() {
  exec('hyprctl monitors -j', (err, stdout) => {
    if (err) {
      console.error("[SYS CONFIG] Error ejecutando hyprctl:", err);
      return;
    }
    try {
      const monitors = JSON.parse(stdout);
      
      let calculatedMinX = Infinity;
      let calculatedMaxX = -Infinity;
      let calculatedMinY = Infinity;
      let calculatedMaxY = -Infinity;

      monitors.forEach(m => {
        const x = parseInt(m.x, 10);
        const y = parseInt(m.y, 10);
        const w = parseInt(m.width, 10);
        const h = parseInt(m.height, 10);

        if (x < calculatedMinX) calculatedMinX = x;
        if (y < calculatedMinY) calculatedMinY = y;
        if (x + w > calculatedMaxX) calculatedMaxX = x + w;
        if (y + h > calculatedMaxY) calculatedMaxY = h + y;
      });

      // Asignación blindada a variables globales
      minX = calculatedMinX;
      maxX = calculatedMaxX;
      minY = calculatedMinY;
      maxY = calculatedMaxY;

      console.log(`[SYS CONFIG] Límites de hardware establecidos -> X: [${minX} a ${maxX}], Y: [${minY} a ${maxY}]`);
    } catch (e) {
      console.error("[SYS CONFIG] Error crítico parseando el JSON de Hyprland:", e);
    }
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

obs.on('ConnectionOpened', () => log('OBS connection opened.'));
obs.on('ConnectionClosed', () => log('OBS connection closed.'));
obs.on('AuthenticationSuccess', () => log('OBS authentication success.'));
obs.on('AuthenticationFailure', () => log('OBS authentication failure.'));

// Ejecutar detección de hardware al arrancar el script
//updateMonitorBounds();

async function connectToOBS() {
  try {
    await obs.connect(`ws://${OBS_HOST}:${OBS_PORT}`, OBS_PASSWORD);
    log('Connected to OBS at', `${OBS_HOST}:${OBS_PORT}`);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log('OBS en espera (OBS está cerrado).');
    } else {
      log('OBS connection failed:', error.message || error);
    }
  }
}

app.post('/api/obs/action', async (req, res) => {
  const { action, payload = {} } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'Missing action in body' });
  }

  try {
    let result;

    switch (action) {
      case 'setCurrentProgramScene': {
        const { sceneName } = payload;
        if (!sceneName) {
          throw new Error('payload.sceneName is required');
        }
        result = await obs.call('SetCurrentProgramScene', { sceneName });
        return res.json({ status: 'ok', action, result });
      }

      case 'toggleMute': {
        const { inputName } = payload;
        if (!inputName) {
          throw new Error('payload.inputName is required');
        }
        result = await obs.call('ToggleInputMute', { inputName });
        return res.json({ status: 'ok', action, result });
      }

      case 'getSceneList': {
        result = await obs.call('GetSceneList');
        return res.json({ status: 'ok', action, scenes: result.scenes || [] });
      }

      default:
        return res.status(400).json({ error: `Unsupported action '${action}'` });
    }
  } catch (error) {
    log('Error handling /api/obs/action:', action, payload, '-', error.message || error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/system/action', (req, res) => {
  const { commandType, payload } = req.body || {};

  if (!commandType) {
    return res.status(400).json({ error: 'Invalid commandType' });
  }

  let command;

  switch (commandType) {
    case 'toggle-obs': {
      exec('pgrep obs', (error, stdout) => {
        if (stdout.trim()) {
          exec('pkill obs', (err) => {
            if (err) {
              log('Error closing OBS:', err.message);
            } else {
              log('OBS closed successfully');
            }
          });
        } else {
          exec('obs &', (err) => {
            if (err) {
              log('Error launching OBS:', err.message);
            } else {
              log('OBS launched successfully');
            }
          });
        }
      });
      return res.json({ status: 'ok', commandType, payload: 'toggled' });
    }

    case 'launchApp': {
      switch (payload) {
        case 'terminal':
          command = 'xdg-terminal-exec &';
          break;
        case 'whatsapp':
          command = 'brave --app=https://web.whatsapp.com &';
          break;
        case 'telegram':
          command = 'env WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 brave --app=https://web.telegram.org &';
          break;
        case 'twitter':
          command = 'brave --app=https://x.com &';
          break;
        case 'twitch':
          command = 'brave --app=https://twitch.tv &';
          break;
        case 'facebook':
          command = 'brave --app=https://facebook.com &';
          break;
        case 'youtube':
          command = 'brave --app=https://youtube.com &';
          break;
        case 'brave':
          command = 'brave &';
          break;
        default:
          return res.status(400).json({ error: `Unknown launchApp payload '${payload}'` });
      }
      break;
    }

    case 'launchGame': {
      switch (payload) {
        case 'guildwars2':
          command = 'lutris lutris:rungame/guild-wars-2 &';
          break;
        default:
          return res.status(400).json({ error: `Unknown launchGame payload '${payload}'` });
      }
      break;
    }

    case 'kill-active': {
      command = 'hyprctl dispatch killactive';
      break;
    }

    case 'system-suspend': {
      command = 'systemctl suspend';
      break;
    }

    case 'system-poweroff': {
      command = 'systemctl poweroff';
      break;
    }

    case 'theater-youtube': {
      command = 'env WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 brave --app=https://www.youtube.com &';
      break;
    }

    case 'theater-netflix': {
      command = 'env WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 brave --app=https://www.netflix.com &';
      break;
    }

    case 'theater-paramount': {
      command = 'env WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 brave --app=https://www.paramountplus.com &';
      break;
    }

    case 'theater-max': {
      command = 'env WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 brave --app=https://www.max.com &';
      break;
    }

    case 'theater-prime': {
      command = 'env WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 brave --app=https://www.primevideo.com &';
      break;
    }

    case 'mouse-move': {
      const data = payload || {};
      const rawX = data.deltaX !== undefined ? data.deltaX : (data.payload?.deltaX !== undefined ? data.payload.deltaX : 0);
      const rawY = data.deltaY !== undefined ? data.deltaY : (data.payload?.deltaY !== undefined ? data.payload.deltaY : 0);

      const parsedX = parseFloat(rawX);
      const parsedY = parseFloat(rawY);

      const safeX = isNaN(parsedX) ? 0 : parsedX;
      const safeY = isNaN(parsedY) ? 0 : parsedY;

      // Acumulación con factor de sensibilidad
      currentMouseX += Math.round(safeX * 1.5);
      currentMouseY += Math.round(safeY * 1.5);

      // Validación perimetral estricta
      if (currentMouseX < minX) currentMouseX = minX;
      if (currentMouseY < minY) currentMouseY = minY;
      if (currentMouseX > maxX) currentMouseX = maxX;
      if (currentMouseY > maxY) currentMouseY = maxY;

      command = `hyprctl dispatch movecursor ${Math.round(currentMouseX)} ${Math.round(currentMouseY)}`;
      break;
    }

    case 'mouse-click-left': {
      command = 'hyprctl dispatch mouse 272';
      break;
    }

    case 'mouse-click-right': {
      command = 'hyprctl dispatch mouse 273';
      break;
    }

    case 'key-up': {
      command = 'hyprctl dispatch sendshortcut " , Up, active"';
      break;
    }

    case 'key-down': {
      command = 'hyprctl dispatch sendshortcut " , Down, active"';
      break;
    }

    case 'key-left': {
      command = 'hyprctl dispatch sendshortcut " , Left, active"';
      break;
    }

    case 'key-right': {
      command = 'hyprctl dispatch sendshortcut " , Right, active"';
      break;
    }

    case 'key-enter': {
      command = 'hyprctl dispatch sendshortcut " , Return, active"';
      break;
    }

    case 'key-space': {
      command = 'hyprctl dispatch sendshortcut " , space, active"';
      break;
    }

    case 'key-backspace': {
      command = 'hyprctl dispatch sendshortcut " , BackSpace, active"';
      break;
    }

    case 'key-search': {
      command = 'hyprctl dispatch sendshortcut "CTRL, F, active"';
      break;
    }

    default:
      return res.status(400).json({ error: `Unsupported commandType '${commandType}'` });
  }

  if (!command) {
    return;
  }

  exec(command, (error, stdout, stderr) => {
    if (error) {
      log(`System command failed (${commandType}:${payload}):`, error.message);
      log('stderr:', stderr || '<no stderr>');
      return;
    }

    log(`System command launched (${commandType}:${payload}):`, command);
    if (stdout) {
      log('stdout:', stdout);
    }
  });

  return res.json({ status: 'ok', commandType, payload });
});

app.listen(SERVER_PORT, SERVER_HOST, async () => {
  log(`Server listening on http://${SERVER_HOST}:${SERVER_PORT}`);
  await connectToOBS();
});
