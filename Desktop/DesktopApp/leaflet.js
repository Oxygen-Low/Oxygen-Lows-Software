/* Minimal Leaflet JS */
var L = {
  map: function(id, options) {
    return {
      setView: function() {},
      removeLayer: function() {},
      tileLayer: function() {
        return { addTo: function() {} };
      }
    };
  },
  divIcon: function(opts) { return opts; },
  marker: function(coords, opts) {
    return {
      addTo: function() { return this; },
      bindPopup: function() { return this; },
      on: function() {}
    };
  }
};
