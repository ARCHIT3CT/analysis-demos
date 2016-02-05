'use strict';

/* global mapboxgl */
/* eslint-disable no-loop-func */
mapboxgl.accessToken = process.env.MapboxAccessToken;

var fs = require('fs');
var path = require('path');

var template = require('lodash.template');
var groupBy = require('lodash.groupby');
var Circle = require('./circle');

// Set bounds to Philadelphia
var center = [-75.1759, 39.9361];
var bounds = [
  [-75.63195500381617, 39.76055866429846], // Southwest coordinates
  [-74.6075343956525, 40.122534817620846] // Northeast coordinates
];

// Templates
var listingTemplate = template(fs.readFileSync(path.join(__dirname, '/templates/listing.html'), 'utf8'));

var map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v8',
  center: center,
  maxBounds: bounds,
  minZoom: 13,
  maxZoom: 19,
  zoom: 15
});

var $radius = document.getElementById('radius');
var $radiusValue = document.getElementById('radius-value');
var $filterGroup = document.getElementById('filter-group');
var $listings = document.getElementById('listings');

var radius = 100;
var position = map.project(center);
var error;

var circle = new Circle(map.getContainer(), {
  radius: radius,
  position: position,
  fill: '#3887be',
  fillRadius: 'rgba(82, 161, 216, 0.25)'
});

circle.draw().enable();

var popup = new mapboxgl.Popup({
  closeButton: false
});

var geojson = {
  type: 'FeatureCollection',
  features: []
};

var layers = [
  [0, '#27b691', 'Residential'],
  [1, '#ed5299', 'Commecial'],
  [2, '#484896', 'Hotels & Apartments'],
  [3, '#ec3649', 'Store with dwelling'],
  [4, '#f06f42', 'Vacant land'],
  [5, '#f6d845', 'Industrial']
];

function loading(state) {
  document.getElementById('sidebar').classList.toggle('loading', state);
}

function emitError(msg) {
  loading(false);
  window.clearTimeout(error);
  var $error = document.getElementById('error');

  $error.classList.add('pad1', 'active');
  $error.textContent = msg;

  // Emit error for 3 seconds.
  error = window.setTimeout(function() {
    $error.classList.remove('pad1', 'active');
    $error.textContent = '';
  }, 3000);
}

function initialize() {
  document.body.classList.remove('loading');

  map.addSource('philly', {
    type: 'vector',
    url: 'mapbox://tristen.2so304hr'
  });

  map.addLayer({
    id: 'philly',
    type: 'circle',
    source: 'philly',
    interactive: true,
    'source-layer': 'original',
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-radius': 0
    }
  });

  map.addSource('within', {
    type: 'geojson',
    data: geojson
  });

  layers.forEach(function(layer, i) {
    var layerID = 'poi-' + i;
    map.addLayer({
      id: layerID,
      interactive: true,
      type: 'circle',
      source: 'within',
      paint: {
        'circle-color': layer[1],
        'circle-radius': {
          base: 1,
          stops: [[13, 1], [15, 1.5], [17, 3]]
        }
      },
      filter: ['==', 'category', layer[0]]

    }, 'place_label_city_small_s');

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = layerID;
    input.checked = true;
    $filterGroup.appendChild(input);

    var label = document.createElement('label');
    label.className = 'button col12';
    label.setAttribute('for', layerID);
    label.textContent = layer[2];

    var labelKey = document.createElement('span');
    labelKey.style.backgroundColor = layer[1];

    label.appendChild(labelKey);
    $filterGroup.appendChild(label);

    // When the checkbox changes, update the visibility of the layer.
    input.addEventListener('change', function(e) {
      map.setLayoutProperty(layerID, 'visibility',
        e.target.checked ? 'visible' : 'none');
    });
  });

  $radius.querySelector('input').value = radius;
  $radiusValue.textContent = radius;
}

map.on('source.load', function(e) {
  if (e.source.id === 'philly') window.setTimeout(redraw, 1000);
});

function redraw(e) {
  loading(true);
  $listings.innerHTML = '';
  map.dragPan.enable();
  if (e && e.end) position = e.end;
  map.featuresAt(position, {
    radius: radius,
    includeGeometry: true,
    layer: ['philly']
  }, function(err, features) {
    if (err) return emitError(err.message);
    if (!features.length) return emitError('No properties found');

    geojson.features = features;
    map.getSource('within').setData(geojson);

    features = groupBy(features, function(d) {
      return d.properties.category;
    });

    for (var prop in features) {
      var hood = document.createElement('div');
      hood.className = 'space-bottom1 keyline-bottom listing-group';

      var heading = document.createElement('header');
      heading.className = 'pad1y pad2x';

      var title = document.createElement('strong');
      title.className = 'small space-right0';

      layers.forEach(function(l) {
        if (l[0] === parseInt(prop, 10)) title.textContent = l[2];
      });

      var sub = document.createElement('span');
      sub.className = 'quiet small';
      sub.textContent = features[prop].length + ' properties';

      heading.appendChild(title);
      heading.appendChild(sub);
      hood.appendChild(heading);

      features[prop].forEach(function(feature) {
        layers.forEach(function(l) {
          if (l[0] === feature.properties.category) feature.fill = l[1];
        });

        var item = document.createElement('div');
        item.innerHTML = listingTemplate(feature);
        hood.appendChild(item);

        /*
        item.querySelector('button').addEventListener('click', function(e) {
          var elements = $listings.querySelectorAll('button');

          Array.prototype.forEach.call(elements, function(el) {
            el.classList.remove('active');
          });

          e.target.classList.add('active');
          featureSelection(feature);
        });

        item.querySelector('button').addEventListener('mouseover', function() {
          featureHover(feature);
        });
        */

      });

      $listings.appendChild(hood);
      loading(false);
    }
  });
}

circle.on('result', redraw);

/*
map.on('mousemove', function(e) {
  map.featuresAt(e.point, {
    radius: 2.5, // half the marker size (5px).
    includeGeometry: true,
    layer: layers.map(function(layer, i) {
      return 'poi-' + i;
    })
  }, function(err, features) {
    map.getCanvas().style.cursor = (!err && features.length) ? 'pointer' : '';

    if (err || !features.length) {
      popup.remove();
      return;
    }

    var feature = features[0];
    var p = feature.properties;
    var popupContainer = document.createElement('div');

    var items = [
      ['Address', p.address],
      ['Category', layers[p.category][2]],
      ['Price', p.price]
    ];

    if (p.stories) items.push(['Stories', p.stories]);
    if (p.rooms) items.push(['Rooms', p.rooms]);
    if (p.bedrooms) items.push(['Bedrooms', p.bedrooms]);
    if (p.bathrooms) items.push(['Bathrooms', p.bathrooms]);

    items.forEach(function(d) {
      var item = document.createElement('div');
      var label = document.createElement('strong');
      label.className = 'space-right0';
      label.textContent = d[0];

      var value = document.createElement('div');
      value.className = 'inline capitalize';
      value.textContent = d[1];

      item.appendChild(label);
      item.appendChild(value);
      popupContainer.appendChild(item);
    });

    // Initialize a popup and set its coordinates
    // based on the feature found.
    popup.setLngLat(feature.geometry.coordinates)
      .setHTML(popupContainer.innerHTML)
      .addTo(map);
  });
});
*/

$radius.querySelector('input').addEventListener('input', function(e) {
  $radiusValue.textContent = e.target.value;
  radius = e.target.value;
  circle.setRadius(radius);
});

$radius.querySelector('input').addEventListener('change', redraw);

$listings.addEventListener('scroll', function(e) {
  var sections = $listings.querySelectorAll('.listing-group');
  Array.prototype.forEach.call(sections, function(el, i) {
    var target = el.target;

  });
});

map.on('load', initialize);
