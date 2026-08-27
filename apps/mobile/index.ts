import { registerGlobals } from '@livekit/react-native';
import { registerRootComponent } from 'expo';

// LiveKit's React Native WebRTC globals must be registered before the first room
// or local track is created. This is intentionally outside React render paths.
registerGlobals();
registerRootComponent(require('./App').default);
