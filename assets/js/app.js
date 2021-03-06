const map = L.map("map", {
  zoomSnap: 0,
  maxZoom: 22,
  zoomControl: false,
  renderer: L.canvas({
    padding: 0.5,
    tolerance: 10
  })
}).fitWorld();
map.attributionControl.setPrefix("<a href='#' onclick='showInfo(); return false;'>About</a>");

map.once("locationfound", function(e) {
  map.fitBounds(e.bounds, {maxZoom: 18});
});

map.on("click", function(e) {
  layers.select.clearLayers();
});

const layers = {
  basemaps: {
    "Streets": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.@2xpng", {
      maxNativeZoom: 18,
      maxZoom: map.getMaxZoom(),
      attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attribution">CARTO</a>',
    }).addTo(map),

    "Aerial": L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 16,
      maxZoom: map.getMaxZoom(),
      attribution: "USGS",
    }),
    
    "Topo": L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 16,
      maxZoom: map.getMaxZoom(),
      attribution: "USGS",
    }),

    "Charts": L.tileLayer("https://tileservice.charts.noaa.gov/tiles/50000_1/{z}/{x}/{y}.png", {
      maxNativeZoom: 18,
      maxZoom: map.getMaxZoom(),
      attribution: "NOAA",
    }),

    "None": L.tileLayer("", {
      maxZoom: map.getMaxZoom()
    })
  },

  select: L.featureGroup(null).addTo(map),
  overlays: {}
};

/*** Begin custom input control for adding local file ***/
L.Control.AddFile = L.Control.extend({
  onAdd: function(map) {
    fileInput = L.DomUtil.create("input", "hidden");
    fileInput.type = "file";
    fileInput.accept = ".mbtiles, .geojson, .kml, .gpx";
    fileInput.style.display = "none";
    
    fileInput.addEventListener("change", function () {
      const file = fileInput.files[0];
      handleFile(file);
      this.value = "";
    }, false);
    
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    div.innerHTML = `
      <a class='leaflet-bar-part leaflet-bar-part-single file-control-btn' title='Load File' onclick='fileInput.click();'>
        <i id='loading-icon' class='fas fa-map-marked-alt'></i>
      </a>
    `;
    L.DomEvent.on(div, "click", function (e) {
      L.DomEvent.stopPropagation(e);
    });
    return div
  }
});

L.control.addfile = function(opts) {
  return new L.Control.AddFile(opts);
}
/*** End custom control ***/

const controls = {
  layerCtrl: L.control.layers(layers.basemaps, null, {
    collapsed: true,
    position: "topright"
  }).addTo(map),

  locateCtrl: L.control.locate({
    icon: "fas fa-crosshairs",
    setView: "untilPan",
    cacheLocation: true,
    position: "topleft",
    flyTo: false,
    keepCurrentZoomLevel: true,
    circleStyle: {
      interactive: false
    },
    markerStyle: {
      interactive: true
    },
    metric: false,
    strings: {
      popup: function(options) {
        const loc = controls.locateCtrl._marker.getLatLng();
        return `<div style="text-align: center;">You are within ${Number(options.distance).toLocaleString()} ${options.unit}<br>from <strong>${loc.lat.toFixed(6)}</strong>, <strong>${loc.lng.toFixed(6)}</strong></div>`;
      }
    },
    locateOptions: {
      enableHighAccuracy: true,
      maxZoom: 18
    },
    onLocationError: function(e) {
      alert(e.message);
    }
  }).addTo(map),

  fileCtrl: L.control.addfile({
    position: "topleft"
  }).addTo(map),

  scaleCtrl: L.control.scale({
    position: "bottomleft"
  }).addTo(map)
};

function handleFile(file) {
  showLoader();
  const name = file.name.split(".").slice(0, -1).join(".");

  if (file.name.endsWith(".mbtiles")) {
    loadRaster(file, name);
  } else if (file.name.endsWith(".geojson") || file.name.endsWith(".kml") || file.name.endsWith(".gpx")) {
    const format = file.name.split(".").pop();
    loadVector(file, name, format);
  } else {
    vex.dialog.alert("MBTiles, GeoJSON, KML, and GPX files supported.");
    hideLoader();
  }
}

function loadVector(file, name, format) {
  const reader = new FileReader();
  let geojson = null;

  reader.onload = function(e) {
    if (format == "geojson") {
      geojson = JSON.parse(reader.result);
    } else if (format == "kml") {
      const kml = (new DOMParser()).parseFromString(reader.result, "text/xml");
      geojson = toGeoJSON.kml(kml, {styles: true});
    } else if (format == "gpx") {
      const gpx = (new DOMParser()).parseFromString(reader.result, "text/xml");
      geojson = toGeoJSON.gpx(gpx);
    }

    createVectorLayer(geojson, name, null, true, null);
  }

  reader.readAsText(file);
}

function createVectorLayer(geojson, name, url, active, key) {
  const layer = L.geoJSON(geojson, {
    bubblingMouseEvents: false,
    useSimpleStyle: true,
    url: url ? url : null,
    onEachFeature: function (feature, layer) {
      let table = "<div style='overflow:auto;'><table>";
      
      if (feature && feature.geometry && feature.geometry.type === "Point") {
        const latitude = feature.geometry.coordinates[1].toFixed(6);
        const longitude = feature.geometry.coordinates[0].toFixed(6);
        table += `<tr><th>LATITUDE</th><td>${latitude}</td></tr>`;
        table += `<tr><th>LONGITUDE</th><td>${longitude}</td></tr>`;
      }

      feature.properties["_id_"] = L.Util.stamp(layer);

      const hiddenProps = ["styleUrl", "styleHash", "styleMapHash", "stroke", "stroke-opacity", "stroke-width", "opacity", "fill", "fill-opacity", "icon", "scale", "coordTimes", "marker-size", "marker-color", "marker-symbol", "_id_"];
      for (const key in feature.properties) {
        if (feature.properties.hasOwnProperty(key) && hiddenProps.indexOf(key) == -1) {
          table += "<tr><th>" + key.toUpperCase() + "</th><td>" + formatProperty(feature.properties[key]) + "</td></tr>";
        }
      }
      table += "</table></div>";
      layer.bindPopup(table, {
        closeButton: false,
        maxHeight: 300,
        maxWidth: 250
      });
      layer.on({
        popupclose: function (e) {
          layers.select.clearLayers();
        },
        click: function (e) {
          layers.select.clearLayers();
          layers.select.addLayer(L.geoJSON(layer.toGeoJSON(), {
            style: {
              color: "#00FFFF",
              weight: 5
            },
            pointToLayer: function (feature, latlng) {
              return L.circleMarker(latlng, {
                radius: 6,
                color: "#00FFFF"
              }); 
            }
          }))
        }
      });
    }
    
  });

  addOverlayLayer(layer, name, key);
  layers.overlays[L.Util.stamp(layer)] = layer;

  if (active) {
    layer.addTo(map);
    zoomToLayer(L.Util.stamp(layer));
  }
}

function fetchGeoJSON(name, url, active, key) {
  if (navigator.onLine) {
    showLoader();
    fetch(url)
      .then(response => response.json())
      .then(data => {
        hideLoader();
        createVectorLayer(data, name, url, active, key);
      }); 
  } else {
    vex.dialog.alert("Must be online to fetch data!");
  }
}

function refreshGeoJSON(id) {
  if (navigator.onLine) {
    const layer = layers.overlays[id];
    if (!map.hasLayer(layer)) {
      map.addLayer(layers.overlays[id]);
    }
    if (layer.options.url) {
      fetch(layer.options.url)
        .then(response => response.json())
        .then(data => {
          if (data) {
            layer.clearLayers().addData(data).useSimpleStyle();
          }
        });
    }
  } else {
    vex.dialog.alert("Must be online to fetch data!");
  }
}

function loadRaster(file, name) {
  const reader = new FileReader();

  reader.onload = function(e) {
    const layer = L.tileLayer.mbTiles(reader.result, {
      autoScale: true,
      fitBounds: true,
      updateWhenIdle: false
    }).on("databaseloaded", function(e) {
      name = (layer.options.name ? layer.options.name : name);
      addOverlayLayer(layer, name);
    }).addTo(map);
    layers.overlays[L.Util.stamp(layer)] = layer;
  }

  reader.readAsArrayBuffer(file);
}

function addOverlayLayer(layer, name, key) {
  hideLoader();
  controls.layerCtrl.addOverlay(layer, `
    <span class="layer-name" id="${L.Util.stamp(layer)}">
      ${name}
    </span>
    <span class="layer-buttons">
      <span style="display: ${(layer instanceof L.GeoJSON && layer.options.url) ? 'unset' : 'none'}">
        <a class="layer-btn" href="#" title="Refresh layer" onclick="refreshGeoJSON(${L.Util.stamp(layer)}); return false;"><i class="fas fa-sync"></i></a>
      </span>
      <a class="layer-btn" href="#" title="Change opacity" onclick="changeOpacity(${L.Util.stamp(layer)}); return false;"><i class="fas fa-adjust"></i></a>
      <a class="layer-btn" href="#" title="Zoom to layer" onclick="zoomToLayer(${L.Util.stamp(layer)}); return false;"><i class="fas fa-expand-arrows-alt"></i></a>
      <a class="layer-btn" href="#" title="Remove layer" onclick="removeLayer(${L.Util.stamp(layer)}, '${name}', 'overlays', '${key}'); return false;"><i class="fas fa-trash" style="color: red"></i></a>
    </span>
    <div style="clear: both;"></div>
  `);
}

function zoomToLayer(id) {
  const layer = layers.overlays[id];
  if (!map.hasLayer(layer)) {
    map.addLayer(layers.overlays[id]);
  }
  if (layer.options.bounds) {
    map.fitBounds(layer.options.bounds);
  }
  else {
    map.fitBounds(layer.getBounds(), {padding: [20, 20]});
  }
}

function removeLayer(id, name, type, key) {
  vex.dialog.confirm({
    message: `Remove ${name}?`,
    callback: function (value) {
      if (value == true) {
        const layer = layers[type][id];
        if (!map.hasLayer(layer)) {
          map.addLayer(layers[type][id]);
        }
        if (layer instanceof L.TileLayer.MBTiles) {
          layer._db.close(); 
        }
        map.removeLayer(layer);
        controls.layerCtrl.removeLayer(layer);

        if (type && key) {
          let storage = localStorage.getItem(type);
          if (storage) {
            storage = JSON.parse(storage);
            storage.forEach((element, index) => {
              if (element.id == key) {
                storage.splice(index, 1);
              }
            });
            localStorage.setItem(type, JSON.stringify(storage));
          }
        }
      }
    }
  })
}

function changeOpacity(id) {
  const layer = layers.overlays[id];
  if (!map.hasLayer(layer)) {
    map.addLayer(layers.overlays[id]);
  }
  if (layer instanceof L.TileLayer.MBTiles) {
    let value = layer.options.opacity;
    if (value > 0.2) {
      layer.setOpacity((value-0.2).toFixed(1));
    } else {
      layer.setOpacity(1);
    }
  } else if (layer instanceof L.GeoJSON) {
    let value = layer.options.opacity ? layer.options.opacity : 1;
    if (value > 0.2) {
      layer.options.opacity = (value-0.2).toFixed(1);
    } else {
      layer.options.opacity = 1;
    }
    layer.setStyle({
      opacity: layer.options.opacity,
      fillOpacity: layer.options.opacity
    });
  }
}

function formatProperty(value) {
  if (typeof value == "string" && value.startsWith("http")) {
    return `<a href="${value}" target="_blank">${value}</a>`;
  } else {
    return value;
  }
}

function showLoader() {
  const loadingIcon = document.getElementById("loading-icon");
  loadingIcon.classList.remove("fa-map-marked-alt");
  loadingIcon.classList.add("fa-spinner", "fa-spin");
}

function hideLoader() {
  const loadingIcon = document.getElementById("loading-icon");
  loadingIcon.classList.remove("fa-spin", "fa-spinner");
  loadingIcon.classList.add("fa-map-marked-alt");
}

function switchBaseLayer(name) {
  const basemaps = Object.keys(layers.basemaps);
  for (const layer of basemaps) {
    if (layer == name) {
      map.addLayer(layers.basemaps[layer]);
    } else {
      map.removeLayer(layers.basemaps[layer]);
    }
  }
}

function showInfo() {
  vex.dialog.alert({ unsafeMessage: `
    <p>Welcome to <strong>GPSMap.app</strong>, an offline capable map viewer with GPS integration!</p>
    <p>Tap the map/marker button to load an MBTiles, GeoJSON, KML, or GPX file directly from your device.</p>
    <p>Tap the layers button to view online basemaps and manage offline layers.</p>
    <p>Tap <a href="#" onclick="layerInput(); return false;">here</a> to save custom online layers.</p>
    <p>Developed by Bryan McBride - mcbride.bryan@gmail.com</p>
  `});
}

function layerInput() {
  vex.closeTop();
  vex.dialog.open({
    message: "Enter layer information below:",
    input: [
      "<input name='name' type='text' placeholder='Name' required />",
      "<input name='url' type='text' placeholder='URL' required />",
      `<select name='type' id='layer-type'>
        <option value='xyz'>XYZ</option>
        <option value='wms'>WMS</option>
        <option value='geojson'>GeoJSON</option>
      </select>`,
      "<input name='layers' id='wms-layers' type='text' placeholder='WMS Layer(s)' style='display: none;' />",
    ].join(''),
    buttons: [{
      type: "submit",
      text: "OK",
      className: "vex-dialog-button-primary"
    }, {
      type: "button",
      text: "Cancel",
      className: "vex-dialog-button-secondary",
      click: function(e) {
        this.close();
      }
    }],
    callback: function (data) {
      if (data) {
        let type = null;
        if (data.type == "geojson") {
          type = "overlays";
        } else {
          type = "basemaps";
        } 

        let storage = localStorage.getItem(type);
        if (storage) {
          storage = JSON.parse(storage);
        } else {
          storage = [];
        }
        data.id = Date.now();
        storage.push({
          "id": data.id,
          "name": data.name,
          "url": data.url,
          "type": data.type,
          "layers": data.layers
        });
        localStorage.setItem(type, JSON.stringify(storage));
        if (type == "overlays") {
          fetchGeoJSON(data.name, data.url, true, data.id);
        } else {
          addBasemap(data.name, data.url, data.id, data.type, data.layers, true);
        }
      }
    },
    afterOpen: function() {
      const typeEl = document.getElementById("layer-type");
      const layersEl = document.getElementById("wms-layers");
      L.DomEvent.on(typeEl, "change", function (e) {
        if (typeEl.value == "wms") {
          layersEl.style.display = "";
          layersEl.required = true;
        } else {
          layersEl.style.display = "none";
          layersEl.required = false;
        }
      });
    }
  })
}

function addBasemap(name, url, id, type, wmsLayers, active) {
  let layer = null;
  if (type == "wms") {
    layer = L.tileLayer.wms(url, {
      maxNativeZoom: 18,
      maxZoom: map.getMaxZoom(),
      layers: wmsLayers,
      format: "image/png"
    });
  } else if (type == "xyz") {
   layer = L.tileLayer(url, {
      maxNativeZoom: 18,
      maxZoom: map.getMaxZoom()
    }); 
  }

  controls.layerCtrl.addBaseLayer(layer, `
    <span class="layer-name" id="${L.Util.stamp(layer)}">
      ${name}
    </span>
    <span class="layer-buttons">
      <a class="layer-btn" href="#" title="Remove layer" onclick="removeLayer(${L.Util.stamp(layer)}, '${name}', 'basemaps', ${id}); return false;"><i class="fas fa-trash" style="color: red"></i></a>
    </span>
    <div style="clear: both;"></div>
  `);

  if (active) {
    switchBaseLayer(null);
    layer.addTo(map);  
  }
  
  layers.basemaps[L.Util.stamp(layer)] = layer;
}

function loadBasemaps() {
  let basemaps = localStorage.getItem("basemaps");
  if (basemaps) {
    basemaps = JSON.parse(basemaps);
    basemaps.forEach(element => {
      addBasemap(element.name, element.url, element.id, element.type, element.layers, false);
    });
  }
}

function loadOverlays() {
  let overlays = localStorage.getItem("overlays");
  if (overlays && navigator.onLine) {
    overlays = JSON.parse(overlays);
    overlays.forEach(element => {
      if (element.type == "geojson") {
        fetchGeoJSON(element.name, element.url, false, element.id);
      }
    });
  }
}

// Drag and drop files
const dropArea = document.getElementById("map");

["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
  dropArea.addEventListener(eventName, function(e) {
    e.preventDefault();
    e.stopPropagation();
  }, false);
});

["dragenter", "dragover"].forEach(eventName => {
  dropArea.addEventListener(eventName, showLoader, false);
});

["dragleave", "drop"].forEach(eventName => {
  dropArea.addEventListener(eventName, hideLoader, false);
});

dropArea.addEventListener("drop", function(e) {
  const file = e.dataTransfer.files[0];
  handleFile(file);
}, false);

window.addEventListener("offline",  function(e) {
  switchBaseLayer("None");
});

initSqlJs({
  locateFile: function() {
    return "assets/vendor/sqljs-1.3.0/sql-wasm.wasm";
  }
}).then(function(SQL){
  vex.defaultOptions.className = "vex-theme-top";
  navigator.onLine ? null : switchBaseLayer("None");
  document.getElementsByClassName("leaflet-control-layers")[0].style.maxHeight = `${(document.getElementById("map").offsetHeight * .75)}px`;
  document.getElementsByClassName("leaflet-control-layers")[0].style.maxWidth = `${(document.getElementById("map").offsetWidth * .75)}px`;
});

loadBasemaps();
loadOverlays();
controls.locateCtrl.start();