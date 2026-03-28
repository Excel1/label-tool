export default {
  failed: 'Action failed',
  success: 'Action was successful',
  annotation: {
    actions: {
      connect: 'Connect MQTT',
      mock: 'Queue Mock Image',
      send: 'Send Image',
      tools: 'More',
      removeSelected: 'Remove Selected Box'
    },
    status: {
      connected: 'Connected',
      disconnected: 'Not connected'
    },
    classSelect: 'Class',
    queue: 'Queue: {count}',
    currentFrame: 'Current Image',
    labels: {
      title: 'Labels',
      deleteHint: 'Delete key removes selection',
      empty: 'No labels yet'
    },
    instructions: 'Select a class, draw with left click, move/resize by dragging. Zoom with mouse wheel and pan with right-click drag.',
    empty: 'Queue is empty. Start MQTT or enqueue a mock image.',
    notify: {
      connected: 'MQTT connected',
      connectFailed: 'MQTT connection failed',
      mockQueued: 'Mock image added to queue',
      mockFailed: 'Failed to load mock image',
      imageLoadFailed: 'Image could not be displayed',
      sent: 'Image and labels sent',
      sendFailed: 'Sending failed'
    }
  }
};
