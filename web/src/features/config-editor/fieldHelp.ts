/**
 * Help text for complex configuration fields
 * Maps field paths to helpful descriptions and examples
 */

export type FieldHelp = {
  description: string;
  example?: string;
  docsUrl?: string;
};

export const FIELD_HELP: Record<string, FieldHelp> = {
  // Model configuration
  'model.attributes_map': {
    description: 'Define which sub-labels (attributes) can be detected for each object type.\n\nValid attributes by object:\n• person: amazon, face\n• car: amazon, an_post, canada_post, dhl, dpd, fedex, gls, license_plate, nzpost, postnl, postnord, purolator, royal_mail, ups, usps\n• motorcycle: license_plate\n\nOnly attributes listed here will be detected. For example, if you add "license_plate" to car, Frigate will try to detect license plates on cars.',
    example: '{\n  "person": ["amazon", "face"],\n  "car": ["license_plate", "fedex", "ups", "amazon"]\n}',
    docsUrl: 'https://docs.frigate.video/configuration/object_detectors/#model',
  },
  'model.labelmap': {
    description: 'Customize the labels for detected objects. Use this to rename objects detected by your model. Keys are the original model labels, values are what you want to call them.',
    example: '{\n  "0": "person",\n  "2": "car"\n}',
    docsUrl: 'https://docs.frigate.video/configuration/object_detectors#model',
  },

  // Camera zones
  'cameras.*.zones': {
    description: 'Define areas within your camera view. Zones let you limit object detection, recording, or notifications to specific regions. Each zone is defined by polygon coordinates.',
    example: '{\n  "front_door": {\n    "coordinates": "0,461,3,0,1919,0,1919,843,1699,492"\n  }\n}',
    docsUrl: 'https://docs.frigate.video/configuration/zones',
  },

  // Objects
  'cameras.*.objects.track': {
    description: 'List of object types to track for this camera. Only objects in this list will be detected and saved.\n\nAll available objects: person, bicycle, car, motorcycle, airplane, bus, train, truck, boat, traffic light, fire hydrant, stop sign, parking meter, bench, bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe, backpack, umbrella, handbag, tie, suitcase, frisbee, skis, snowboard, sports ball, kite, baseball bat, baseball glove, skateboard, surfboard, tennis racket, bottle, wine glass, cup, fork, knife, spoon, bowl, banana, apple, sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake, chair, couch, potted plant, bed, dining table, toilet, tv, laptop, mouse, remote, keyboard, cell phone, microwave, oven, toaster, sink, refrigerator, book, clock, vase, scissors, teddy bear, hair drier, toothbrush',
    example: '["person", "car", "dog", "cat"]',
    docsUrl: 'https://docs.frigate.video/configuration/object_detectors/#supported-models',
  },
  'objects.track': {
    description: 'Default list of object types to track across all cameras. Can be overridden per camera.\n\nCommon objects: person, car, dog, cat, bicycle, motorcycle, truck, bird\n\nSee help on "cameras > [camera] > objects > track" for full list of 80 supported objects.',
    example: '["person", "car"]',
    docsUrl: 'https://docs.frigate.video/configuration/objects/#objects',
  },

  // Motion
  'cameras.*.motion.mask': {
    description: 'Polygon coordinates to exclude from motion detection. Use this to ignore areas with constant motion like trees, flags, or busy streets. Coordinates are in format: x1,y1,x2,y2,x3,y3...',
    example: '"0,0,1000,0,1000,200,0,200"',
    docsUrl: 'https://docs.frigate.video/configuration/masks',
  },
  'motion.mask': {
    description: 'Default motion mask applied to all cameras. Polygon coordinates to exclude from motion detection.',
    docsUrl: 'https://docs.frigate.video/configuration/masks',
  },

  // Object filters
  'cameras.*.objects.filters': {
    description: 'Filter detected objects by size, confidence, zones, etc. Use min_area to ignore small detections, min_score for confidence threshold, and mask to limit detection areas.',
    docsUrl: 'https://docs.frigate.video/configuration/object_filters',
  },

  // MQTT
  'mqtt.host': {
    description: 'Hostname or IP address of your MQTT broker. Use "mqtt" if running MQTT in Docker Compose, or the IP address if external.',
    example: 'mqtt (for Docker) or 192.168.1.100',
    docsUrl: 'https://docs.frigate.video/configuration/mqtt',
  },

  // Go2RTC
  'go2rtc': {
    description: 'Go2RTC configuration for live streaming. Define RTSP/WebRTC streams here. Each stream can have multiple sources for failover.',
    example: '{\n  "streams": {\n    "camera1": "rtsp://192.168.1.5:554/stream"\n  }\n}',
    docsUrl: 'https://docs.frigate.video/configuration/live',
  },

  // Detectors
  'detectors': {
    description: 'Object detection hardware configuration. CPU detector is slow and only for testing. Use a Coral TPU, GPU, or other accelerator for production.',
    docsUrl: 'https://docs.frigate.video/configuration/object_detectors',
  },

  // FFmpeg inputs
  'cameras.*.ffmpeg.inputs': {
    description: 'Camera stream sources. Each input has a path (RTSP URL) and roles (detect, record). Use separate inputs for sub-streams (detect) and main streams (record) for best performance.',
    example: '[{\n  "path": "rtsp://camera/substream",\n  "roles": ["detect"]\n}, {\n  "path": "rtsp://camera/mainstream",\n  "roles": ["record"]\n}]',
    docsUrl: 'https://docs.frigate.video/configuration/camera_specific#ffmpeg-inputs',
  },

  // Record
  'cameras.*.record.retain.days': {
    description: 'Number of days to keep recordings. Can be a decimal (e.g., 0.5 = 12 hours). Set to 0 to disable recording retention limits.',
    example: '7 (keep 7 days) or 0.5 (keep 12 hours)',
    docsUrl: 'https://docs.frigate.video/configuration/record',
  },

  // Snapshots
  'cameras.*.snapshots.retain.days': {
    description: 'Number of days to keep snapshot images. Snapshots are saved when objects are detected.',
    example: '10',
    docsUrl: 'https://docs.frigate.video/configuration/snapshots',
  },
};

/**
 * Generate help from schema automatically
 */
export function generateHelpFromSchema(schema: any): FieldHelp | null {
  if (!schema) return null;

  let description = schema.description || schema.title || '';
  let example = '';

  // Add enum values if present
  if (schema.enum && Array.isArray(schema.enum)) {
    description += `\n\nValid options:\n${schema.enum.map((v: any) => `• ${v}`).join('\n')}`;
  }

  // Add min/max constraints
  if (schema.minimum !== undefined || schema.maximum !== undefined) {
    const constraints = [];
    if (schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
    if (schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
    description += `\n\nConstraints: ${constraints.join(', ')}`;
  }

  // Add default value if present
  if (schema.default !== undefined) {
    description += `\n\nDefault: ${JSON.stringify(schema.default)}`;
  }

  // Generate example from default or enum
  if (schema.default !== undefined) {
    example = JSON.stringify(schema.default, null, 2);
  } else if (schema.enum && schema.enum.length > 0) {
    example = JSON.stringify(schema.enum[0]);
  }

  if (!description) return null;

  return {
    description: description.trim(),
    example: example || undefined,
  };
}

/**
 * Get help text for a field path
 * Supports wildcards like "cameras.*.zones"
 * Falls back to auto-generated help from schema if no manual entry exists
 */
export function getFieldHelp(path: string[], schema?: any): FieldHelp | null {
  // Try exact match first
  const exactKey = path.join('.');
  if (FIELD_HELP[exactKey]) {
    return FIELD_HELP[exactKey];
  }

  // Try wildcard match (cameras.*.zones matches cameras.mycam.zones)
  for (const key in FIELD_HELP) {
    const pattern = key.split('.');
    if (pattern.length !== path.length) continue;

    let matches = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== '*' && pattern[i] !== path[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return FIELD_HELP[key];
    }
  }

  // Fall back to auto-generated help from schema
  if (schema) {
    return generateHelpFromSchema(schema);
  }

  return null;
}
