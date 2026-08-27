import { useEffect, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

import type { DeviceOrientation } from '../types';

export function OrientationSafeCaptureView({ children }: PropsWithChildren) {
  const [orientation, setOrientation] = useState<DeviceOrientation>('portrait');

  useEffect(() => {
    let mounted = true;
    void ScreenOrientation.getOrientationAsync().then((value) => {
      if (mounted) setOrientation(toDeviceOrientation(value));
    });
    const subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
      setOrientation(toDeviceOrientation(orientationInfo.orientation));
    });
    return () => {
      mounted = false;
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  return <View style={[styles.root, orientation === 'landscape' && styles.landscape]}>{children}</View>;
}

function toDeviceOrientation(orientation: ScreenOrientation.Orientation): DeviceOrientation {
  return orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
    orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
    ? 'landscape'
    : 'portrait';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08111f' },
  landscape: { flexDirection: 'row' },
});
