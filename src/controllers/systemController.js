const shell = require('../services/shellService');

// Dynamic monitor/mouse bounds and current cursor state
let minX = 0, maxX = 5760;
let minY = 1080, maxY = 2160;
let currentMouseX = 2880;
let currentMouseY = 1620;

async function updateMonitorBounds() {
  try {
    const { stdout } = await shell.execCommand('hyprctl monitors -j');
    const monitors = JSON.parse(stdout || '[]');

    let calculatedMinX = Infinity;
    let calculatedMaxX = -Infinity;
    let calculatedMinY = Infinity;
    let calculatedMaxY = -Infinity;

    monitors.forEach(m => {
      const x = parseInt(m.x, 10);
      const y = parseInt(m.y, 10);
      const w = parseInt(m.width, 10);
      const h = parseInt(m.height, 10);

      if (Number.isFinite(x) && x < calculatedMinX) calculatedMinX = x;
      if (Number.isFinite(y) && y < calculatedMinY) calculatedMinY = y;
      if (Number.isFinite(w) && x + w > calculatedMaxX) calculatedMaxX = x + w;
      if (Number.isFinite(h) && y + h > calculatedMaxY) calculatedMaxY = y + h;
    });

    if (calculatedMinX !== Infinity) minX = calculatedMinX;
    if (calculatedMaxX !== -Infinity) maxX = calculatedMaxX;
    if (calculatedMinY !== Infinity) minY = calculatedMinY;
    if (calculatedMaxY !== -Infinity) maxY = calculatedMaxY;

    console.log(`[SYS CONFIG] Monitor bounds -> X:[${minX}..${maxX}] Y:[${minY}..${maxY}]`);
  } catch (e) {
    console.error('[SYS CONFIG] Failed to update monitor bounds:', e && e.error ? e.error : e);
  }
}

async function executeAction(commandType, payload) {
  let command = null;

  switch (commandType) {
    case 'toggle-obs': {
      try {
        const { stdout } = await shell.execCommand('pgrep obs || true');
        if (stdout && stdout.trim()) {
          command = 'pkill obs';
        } else {
          command = 'obs &';
        }
      } catch (e) {
        command = 'obs &';
      }
      break;
    }

    case 'launchApp': {
      switch (payload) {
        case 'terminal': command = 'xdg-terminal-exec &'; break;
        case 'whatsapp': command = 'brave --app=https://web.whatsapp.com &'; break;
        case 'telegram': command = 'env WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 brave --app=https://web.telegram.org &'; break;
        case 'twitter': command = 'brave --app=https://x.com &'; break;
        case 'twitch': command = 'brave --app=https://twitch.tv &'; break;
        case 'facebook': command = 'brave --app=https://facebook.com &'; break;
        case 'discord': command = 'omarchy-launch-webapp https://discord.com/channels/@me &'; break;
        case 'youtube': command = 'brave --app=https://youtube.com &'; break;
        case 'brave': command = 'brave &'; break;
        default: throw new Error(`Unknown launchApp payload '${payload}'`);
      }
      break;
    }

    case 'launchGame': {
      switch (payload) {
        case 'guildwars2': command = 'lutris lutris:rungame/guild-wars-2 &'; break;
        default: throw new Error(`Unknown launchGame payload '${payload}'`);
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
      const rawX = data.deltaX !== undefined ? data.deltaX : (data.payload && data.payload.deltaX !== undefined ? data.payload.deltaX : 0);
      const rawY = data.deltaY !== undefined ? data.deltaY : (data.payload && data.payload.deltaY !== undefined ? data.payload.deltaY : 0);

      const parsedX = parseFloat(rawX);
      const parsedY = parseFloat(rawY);

      const safeX = isNaN(parsedX) ? 0 : parsedX;
      const safeY = isNaN(parsedY) ? 0 : parsedY;

      currentMouseX += Math.round(safeX * 1.5);
      currentMouseY += Math.round(safeY * 1.5);

      if (currentMouseX < minX) currentMouseX = minX;
      if (currentMouseY < minY) currentMouseY = minY;
      if (currentMouseX > maxX) currentMouseX = maxX;
      if (currentMouseY > maxY) currentMouseY = maxY;

      command = `hyprctl dispatch movecursor ${Math.round(currentMouseX)} ${Math.round(currentMouseY)}`;
      break;
    }

    case 'mouse-click-left': {
      command = 'wlrctl pointer click left';
      break;
    }

    case 'mouse-click-right': {
      command = 'wlrctl pointer click right';
      break;
    }

    case 'type-character': {
      const char = (payload && (payload.char || (payload.payload && payload.payload.char))) || '';
      if (char) command = `hyprctl dispatch sendshortcut , ${char}, active`;
      break;
    }

    case 'press-key': {
      const key = (payload && (payload.key || (payload.payload && payload.payload.key))) || '';
      if (key) command = `hyprctl dispatch sendshortcut , ${key}, active`;
      break;
    }

    case 'key-up': { command = 'hyprctl dispatch sendshortcut " , Up, active"'; break; }
    case 'key-down': { command = 'hyprctl dispatch sendshortcut " , Down, active"'; break; }
    case 'key-left': { command = 'hyprctl dispatch sendshortcut " , Left, active"'; break; }
    case 'key-right': { command = 'hyprctl dispatch sendshortcut " , Right, active"'; break; }
    case 'key-enter': { command = 'hyprctl dispatch sendshortcut " , Return, active"'; break; }
    case 'key-space': { command = 'hyprctl dispatch sendshortcut " , space, active"'; break; }
    case 'key-backspace': { command = 'hyprctl dispatch sendshortcut " , BackSpace, active"'; break; }
    case 'key-search': { command = 'hyprctl dispatch sendshortcut "CTRL, F, active"'; break; }

    default:
      throw new Error(`Unsupported commandType '${commandType}'`);
  }

  if (!command) {
    return { status: 'noop', commandType, payload };
  }

  const result = await shell.execCommand(command).catch(err => { throw err; });
  return { status: 'ok', commandType, payload, command, result };
}

module.exports = {
  executeAction,
  updateMonitorBounds
};
