const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const modelName = 'vits-piper-en_US-amy-low';

module.exports = function withTtsModel(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const source = path.join(modConfig.modRequest.projectRoot, 'models', modelName);
      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
        'models',
        modelName,
      );
      if (!fs.existsSync(path.join(source, 'en_US-amy-low.onnx'))) {
        throw new Error(`On-device TTS model is missing at ${source}`);
      }
      fs.rmSync(destination, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(source, destination, { recursive: true });
      return modConfig;
    },
  ]);
};
