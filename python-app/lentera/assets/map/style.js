window.offlineStyle = {
  version: 8,

  name: 'LENTERA Offline Shortbread',

  sources: {
    shortbread: {
      type: 'vector',
      tiles: [window.location.origin + '/map/tiles/{z}/{x}/{y}.pbf'],
      minzoom: 0,
      maxzoom: 14,
      bounds: [104.1394,-9.541155,116.5814,-3.951935],
      attribution:
        '\u00a9 OpenStreetMap contributors \u00b7 Geofabrik'
    }
  },

  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#f3f1eb'
      }
    },

    {
      id: 'land',
      type: 'fill',
      source: 'shortbread',
      'source-layer': 'land',
      paint: {
        'fill-color': '#e4eddd',
        'fill-opacity': 0.85
      }
    },

    {
      id: 'water-polygons',
      type: 'fill',
      source: 'shortbread',
      'source-layer': 'water_polygons',
      paint: {
        'fill-color': '#aed8ee'
      }
    },

    {
      id: 'water-lines',
      type: 'line',
      source: 'shortbread',
      'source-layer': 'water_lines',
      paint: {
        'line-color': '#8bc5e8',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 0.5,
          14, 2.5
        ]
      }
    },

    {
      id: 'street-polygons-outline',
      type: 'line',
      source: 'shortbread',
      'source-layer': 'street_polygons',
      paint: {
        'line-color': '#cac5bd',
        'line-width': 1
      }
    },

    {
      id: 'street-polygons',
      type: 'fill',
      source: 'shortbread',
      'source-layer': 'street_polygons',
      paint: {
        'fill-color': '#ffffff'
      }
    },

    {
      id: 'streets-outline',
      type: 'line',
      source: 'shortbread',
      'source-layer': 'streets',
      minzoom: 13,
      paint: {
        'line-color': '#c4bfb7',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 2,
          16, 8
        ]
      }
    },

    {
      id: 'streets',
      type: 'line',
      source: 'shortbread',
      'source-layer': 'streets',
      minzoom: 13,
      paint: {
        'line-color': '#ffffff',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 1.4,
          16, 6
        ]
      }
    },

    {
      id: 'buildings',
      type: 'fill',
      source: 'shortbread',
      'source-layer': 'buildings',
      minzoom: 14,
      paint: {
        'fill-color': '#d4cec5',
        'fill-outline-color': '#bdb5aa',
        'fill-opacity': 0.9
      }
    }
  ]
};
