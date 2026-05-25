const express = require('express');
const path = require('path');
const systemController = require('./src/controllers/systemController');
let OBSWebSocket = require('obs-websocket-js');

if (OBSWebSocket && OBSWebSocket.default) OBSWebSocket = OBSWebSocket.default;

const obs = new OBSWebSocket();
const app = express();
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_HOST = '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/system/action', async (req, res) => {
  const { commandType, payload } = req.body || {};
  if (!commandType) return res.status(400).json({ error: 'Invalid commandType' });
  try {
    const result = await systemController.executeAction(commandType, payload);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
});

app.post('/api/obs/action', async (req, res) => {
  const { action, payload = {} } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action in body' });
  try {
    if (action === 'setCurrentProgramScene') {
      const { sceneName } = payload;
      if (!sceneName) throw new Error('payload.sceneName is required');
      const result = await obs.call('SetCurrentProgramScene', { sceneName });
      return res.json({ status: 'ok', action, result });
    }
    if (action === 'toggleMute') {
      const { inputName } = payload;
      if (!inputName) throw new Error('payload.inputName is required');
      const result = await obs.call('ToggleInputMute', { inputName });
      return res.json({ status: 'ok', action, result });
    }
    if (action === 'getSceneList') {
      const result = await obs.call('GetSceneList');
      return res.json({ status: 'ok', action, scenes: result.scenes || [] });
    }
    return res.status(400).json({ error: `Unsupported action '${action}'` });
  } catch (error) {
    return res.status(500).json({ error: error && error.message ? error.message : String(error) });
  }
});

app.listen(SERVER_PORT, SERVER_HOST, async () => {
  console.log(`Server listening on http://${SERVER_HOST}:${SERVER_PORT}`);
  try {
    await obs.connect(`ws://${process.env.OBS_HOST || '127.0.0.1'}:${parseInt(process.env.OBS_PORT,10) || 4455}`, process.env.OBS_PASSWORD || '');
    console.log('Connected to OBS');
  } catch (e) {
    console.log('OBS connect error (will retry externally):', e && e.message ? e.message : e);
  }
});
