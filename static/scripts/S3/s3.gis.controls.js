/**
 * S3 GIS Controls
 * Used by the Map (modules/s3gis.py)
 * For Production usage gets assembled into s3.gis.min.js
 * Functions which are called by user need to be in global scope
 * This script is in Static to allow caching
 * Dynamic constants (e.g. Internationalised strings) are set in server-generated script
 */

// Add Controls to the OpenLayers map
// (to be called after the layers are added)
function addControls() {
    map.addControl(new OpenLayers.Control.ScaleLine());
    if (S3.gis.mouse_position == 'mgrs') {
        map.addControl(new OpenLayers.Control.MGRSMousePosition());
    } else if (S3.gis.mouse_position) {
        map.addControl(new OpenLayers.Control.MousePosition());
    }
    map.addControl(new OpenLayers.Control.Permalink());
    map.addControl(new OpenLayers.Control.OverviewMap({mapOptions: S3.gis.options}));

    // Popup Controls
    addPopupControls();
}

/* Popups */
function addPopupControls() {
    // onClick Popup
    S3.gis.popupControl = new OpenLayers.Control.SelectFeature(
        S3.gis.layers_all, {
            toggle: true,
            clickout: true,
            multiple: true
        }
    );
    // onHover Tooltip
    S3.gis.highlightControl = new OpenLayers.Control.SelectFeature(
        S3.gis.layers_all, {
            hover: true,
            highlightOnly: true,
            //renderIntent: 'temporary',
            eventListeners: {
                featurehighlighted: s3_gis_tooltipSelect,
                featureunhighlighted: s3_gis_tooltipUnselect
            }
        }
    );
    map.addControl(S3.gis.highlightControl);
    map.addControl(S3.gis.popupControl);
    S3.gis.highlightControl.activate();
    S3.gis.popupControl.activate();
}

// Supports S3.gis.popupControl for All Vector Layers
function onFeatureUnselect(event) {
    var feature = event.feature;
    if (feature.popup) {
        map.removePopup(feature.popup);
        feature.popup.destroy();
        delete feature.popup;
    }
}
function onPopupClose(evt) {
    // Close all Popups
    // Close popups associated with features
    //S3.gis.popupControl.unselectAll();
    // Close orphaned Popups (e.g. from Refresh)
    while (map.popups.length) {
        map.removePopup(map.popups[0]);
    }
}

// Supports S3.gis.highlightControl for All Vector Layers
function s3_gis_tooltipSelect(event) {
    var feature = event.feature;
    if (feature.cluster) {
        // Cluster
        // no tooltip
    } else {
        // Single Feature
        //S3.gis.selectedFeature = feature;
        // if there is already an opened details window, don\'t draw the tooltip
        if (feature.popup != null) {
            return;
        }
        // if there are other tooltips active, destroy them
        if (S3.gis.tooltipPopup != null) {
            map.removePopup(S3.gis.tooltipPopup);
            S3.gis.tooltipPopup.destroy();
            if (S3.gis.lastFeature != null) {
                delete S3.gis.lastFeature.popup;
            }
            S3.gis.tooltipPopup = null;
        }
        S3.gis.lastFeature = feature;
        var centerPoint = feature.geometry.getBounds().getCenterLonLat();
        var attributes = feature.attributes;
        var tooltip;
        if (undefined != attributes.popup) {
            // GeoJSON Feature Layers
            tooltip = attributes.popup;
        } else if (undefined != attributes.name) {
            // GeoJSON, GeoRSS or Legacy Features
            tooltip = attributes.name;
        } else {
            // KML or WFS
            var titleField = feature.layer.title;
            if (undefined != titleField) {
                var type = typeof attributes[titleField];
                if ('object' == type) {
                    tooltip = attributes[titleField].value;
                } else {
                    tooltip = attributes[titleField];
                }
            }
        }
        if (tooltip) {
            S3.gis.tooltipPopup = new OpenLayers.Popup(
                'activetooltip',
                centerPoint,
                new OpenLayers.Size(80, 12),
                tooltip,
                false
            );
        }
        if (S3.gis.tooltipPopup != null) {
            // should be moved to CSS
            S3.gis.tooltipPopup.contentDiv.style.backgroundColor = 'ffffcb';
            S3.gis.tooltipPopup.contentDiv.style.overflow = 'hidden';
            S3.gis.tooltipPopup.contentDiv.style.padding = '3px';
            S3.gis.tooltipPopup.contentDiv.style.margin = '10px';
            S3.gis.tooltipPopup.closeOnMove = true;
            S3.gis.tooltipPopup.autoSize = true;
            S3.gis.tooltipPopup.opacity = 0.7;
            feature.popup = S3.gis.tooltipPopup;
            map.addPopup(S3.gis.tooltipPopup);
        }
    }
}
function s3_gis_tooltipUnselect(event) {
    var feature = event.feature;
    if (feature != null && feature.popup != null) {
        map.removePopup(feature.popup);
        feature.popup.destroy();
        delete feature.popup;
        S3.gis.tooltipPopup = null;
        S3.gis.lastFeature = null;
    }
}

// Replace Cluster Popup contents with selected Feature Popup
function s3_gis_loadClusterPopup(url, id) {
    // Show Throbber whilst waiting for Popup to show
    var contents = S3.i18n.gis_loading + "...<img src='" + S3.gis.ajax_loader + "' border=0 />";
    $('#' + id + '_contentDiv').html(contents);
    // Load data into Popup
    $.get(
        url,
        function(data) {
            $('#' + id + '_contentDiv').html(data);
            map.popups[0].updateSize();
        },
        'html'
    );
}

// Zoom to Selected Feature from within Cluster Popup
function s3_gis_zoomToSelectedFeature(lon, lat, zoomfactor) {
    var lonlat = new OpenLayers.LonLat(lon, lat);
    // Get Current Zoom
    var currZoom = map.getZoom();
    // New Zoom
    var newZoom = currZoom + zoomfactor;
    // Center and Zoom
    map.setCenter(lonlat, newZoom);
    // Remove Popups
    for (var i = 0; i < map.popups.length; i++) {
        map.removePopup(map.popups[i]);
    }
}


/* Toolbar Buttons */

// Geolocate control
// HTML5 GeoLocation: http://dev.w3.org/geo/api/spec-source.html
function addGeolocateControl(toolbar) {
    // Use the Draft Features layer
    var vector = S3.gis.draftLayer;

    var style = {
        fillColor: '#000',
        fillOpacity: 0.1,
        strokeWidth: 0
    };

    var geolocate = new OpenLayers.Control.Geolocate({
        geolocationOptions: {
            enableHighAccuracy: false,
            maximumAge: 0,
            timeout: 7000
        }
    });
    map.addControl(geolocate);

    geolocate.events.register('locationupdated', this, function(e) {
        vector.removeAllFeatures();
        var circle = new OpenLayers.Feature.Vector(
            OpenLayers.Geometry.Polygon.createRegularPolygon(
                new OpenLayers.Geometry.Point(e.point.x, e.point.y),
                e.position.coords.accuracy / 2,
                40,
                0
            ),
            {},
            style
        );
        vector.addFeatures([
            new OpenLayers.Feature.Vector(
                e.point,
                {},
                {
                    graphicName: 'cross',
                    strokeColor: '#f00',
                    strokeWidth: 2,
                    fillOpacity: 0,
                    pointRadius: 10
                }
            ),
            circle
        ]);
        map.zoomToExtent(vector.getDataExtent());
        s3_gis_pulsate(circle);
    });

    geolocate.events.register('locationfailed', this, function() {
        OpenLayers.Console.log('Location detection failed');
    });

    // Pass to global scope
    S3.gis.geolocateControl = geolocate;

    // Toolbar Button
    var geoLocateButton = new Ext.Toolbar.Button({
        iconCls: 'geolocation',
        tooltip: S3.i18n.gis_geoLocate,
        handler: function() {
            S3.gis.draftLayer.removeAllFeatures();
            //S3.gis.geolocateControl.deactivate();
            //S3.gis.geolocateControl.watch = false;
            S3.gis.geolocateControl.activate();
        }
    });
    toolbar.addButton(geoLocateButton);
}

// Supports GeoLocate control
// Needs to be in global scope as activated by user
var s3_gis_pulsate = function(feature) {
    var point = feature.geometry.getCentroid(),
        bounds = feature.geometry.getBounds(),
        radius = Math.abs((bounds.right - bounds.left) / 2),
        count = 0,
        grow = 'up';

    var resize = function(){
        if (count > 16) {
            clearInterval(window.resizeInterval);
        }
        var interval = radius * 0.03;
        var ratio = interval / radius;
        switch(count) {
            case 4:
            case 12:
                grow = 'down'; break;
            case 8:
                grow = 'up'; break;
        }
        if (grow !== 'up') {
            ratio = - Math.abs(ratio);
        }
        feature.geometry.resize(1 + ratio, point);
        S3.gis.draftLayer.drawFeature(feature);
        count++;
    };
    window.resizeInterval = window.setInterval(resize, 50, point, radius);
};

// Google Earth control
function addGoogleEarthControl(toolbar) {
    // Toolbar Button
    var googleEarthButton = new Ext.Toolbar.Button({
        iconCls: 'googleearth',
        tooltip: S3.gis.Google.Earth,
        enableToggle: true,
        toggleHandler: function(button, state) {
            if (state === true) {
                S3.gis.mapPanelContainer.getLayout().setActiveItem(1);
                // Since the LayerTree isn't useful, collapse it
                S3.gis.mapWin.items.items[0].collapse();
                S3.gis.googleEarthPanel.on('pluginready', function() {
                    addGoogleEarthKmlLayers();
                });
            } else {
                S3.gis.mapPanelContainer.getLayout().setActiveItem(0);
                S3.gis.mapWin.items.items[0].expand();
            }
        }
    });
    toolbar.addSeparator();
    toolbar.addButton(googleEarthButton);
}

// Supports GE Control
function addGoogleEarthKmlLayers() {
    if (S3.gis.layers_features) {
        for (i = 0; i < S3.gis.layers_features.length; i++) {
            var layer = S3.gis.layers_features[i];
            if (undefined != layer.visibility) {
                var visibility = layer.visibility;
            } else {
                // Default to visible
                var visibility = true;
            }
            if (visibility) {
                // @ToDo: Add Authentication when-required
                var url = S3.public_url + layer.url.replace('geojson', 'kml');
                google.earth.fetchKml(S3.gis.googleEarthPanel.earth, url, googleEarthKmlLoaded);
            }
        }
    }
}

function googleEarthKmlLoaded(object) {
    if (!object) {
        return;
    }
    S3.gis.googleEarthPanel.earth.getFeatures().appendChild(object);
}

// Google Streetview control
function addGoogleStreetviewControl(toolbar) {
    var Clicker = OpenLayers.Class(OpenLayers.Control, {                
        defaults: {
            pixelTolerance: 1,
            stopSingle: true
        },
        initialize: function(options) {
            this.handlerOptions = OpenLayers.Util.extend(
                {}, this.defaults
            );
            OpenLayers.Control.prototype.initialize.apply(this, arguments); 
            this.handler = new OpenLayers.Handler.Click(
                this, {click: this.trigger}, this.handlerOptions
            );
        }, 
        trigger: function(event) {
            openStreetviewPopup(map.getLonLatFromViewPortPx(event.xy));
        }
    });
    S3.gis.StreetviewClicker = new Clicker({autoactivate: false});
    map.addControl(S3.gis.StreetviewClicker);

    // Toolbar Button
    var googleStreetviewButton = new Ext.Toolbar.Button({
        iconCls: 'streetview',
        tooltip: S3.gis.Google.StreetviewButton,
        toggleGroup: 'controls',
        allowDepress: true,
        enableToggle: true,
        toggleHandler: function(button, state) {
            if (state === true) {
                S3.gis.StreetviewClicker.activate();
            } else {
                S3.gis.StreetviewClicker.deactivate();
            }
        }
    });
    toolbar.addSeparator();
    toolbar.addButton(googleStreetviewButton);
}

// Supports Streetview Control
function openStreetviewPopup(location) {
    if (!location) {
        location = map.getCenter();
    }
    if (S3.gis.sv_popup && S3.gis.sv_popup.anc) {
        S3.gis.sv_popup.close();
    }
    S3.gis.sv_popup = new GeoExt.Popup({
        title: S3.gis.Google.StreetviewTitle,
        location: location,
        width: 300,
        height: 300,
        collapsible: true,
        map: S3.gis.mapPanel,
        items: [new gxp.GoogleStreetViewPanel()]
    });
    S3.gis.sv_popup.show();
}

// Measure Controls
function addMeasureControls(toolbar) {
    var measureSymbolizers = {
        'Point': {
            pointRadius: 5,
            graphicName: 'circle',
            fillColor: 'white',
            fillOpacity: 1,
            strokeWidth: 1,
            strokeOpacity: 1,
            strokeColor: '#f5902e'
        },
        'Line': {
            strokeWidth: 3,
            strokeOpacity: 1,
            strokeColor: '#f5902e',
            strokeDashstyle: 'dash'
        },
        'Polygon': {
            strokeWidth: 2,
            strokeOpacity: 1,
            strokeColor: '#f5902e',
            fillColor: 'white',
            fillOpacity: 0.5
        }
    };
    var styleMeasure = new OpenLayers.Style();
    styleMeasure.addRules([
        new OpenLayers.Rule({symbolizer: measureSymbolizers})
    ]);
    var styleMapMeasure = new OpenLayers.StyleMap({'default': styleMeasure});

    var length = new OpenLayers.Control.Measure(
        OpenLayers.Handler.Path, {
            geodesic: true,
            persist: true,
            handlerOptions: {
                layerOptions: {styleMap: styleMapMeasure}
            }
        }
    );
    length.events.on({
        'measure': function(evt) {
            alert(S3.i18n.gis_length_message + ' ' + evt.measure.toFixed(2) + ' ' + evt.units);
        }
    });

    var area = new OpenLayers.Control.Measure(
        OpenLayers.Handler.Polygon, {
            geodesic: true,
            persist: true,
            handlerOptions: {
                layerOptions: {styleMap: styleMapMeasure}
            }
        }
    );
    area.events.on({
        'measure': function(evt) {
            alert(S3.i18n.gis_area_message + ' ' + evt.measure.toFixed(2) + ' ' + evt.units + '2');
        }
    });

    // Toolbar Buttons
    // 1st of these 2 to get activated cannot be deselected!
    var lengthButton = new GeoExt.Action({
        control: length,
        map: map,
        iconCls: 'measure-off',
        // button options
        tooltip: S3.i18n.gis_length_tooltip,
        toggleGroup: 'controls',
        allowDepress: true,
        enableToggle: true
    });

    var areaButton = new GeoExt.Action({
        control: area,
        map: map,
        iconCls: 'measure-area',
        // button options
        tooltip: S3.i18n.gis_area_tooltip,
        toggleGroup: 'controls',
        allowDepress: true,
        enableToggle: true
    });
   
    toolbar.add(lengthButton);
    toolbar.add(areaButton);
}

// Navigation History
function addNavigationControl(toolbar) {
    var nav = new OpenLayers.Control.NavigationHistory();
    map.addControl(nav);
    nav.activate();
    // Toolbar Buttons
    var navPreviousButton = new Ext.Toolbar.Button({
        iconCls: 'back',
        tooltip: S3.i18n.gis_navPrevious,
        handler: nav.previous.trigger
    });
    var navNextButton = new Ext.Toolbar.Button({
        iconCls: 'next',
        tooltip: S3.i18n.gis_navNext,
        handler: nav.next.trigger
    });
    toolbar.addButton(navPreviousButton);
    toolbar.addButton(navNextButton);
}

// Point Control to add new Markers to the Map
function addPointControl(toolbar, point_pressed) {
    OpenLayers.Handler.PointS3 = OpenLayers.Class(OpenLayers.Handler.Point, {
        // Ensure that we propagate Double Clicks (so we can still Zoom)
        dblclick: function(evt) {
            //OpenLayers.Event.stop(evt);
            return true;
        },
        CLASS_NAME: 'OpenLayers.Handler.PointS3'
    });

    // Toolbar Button
    S3.gis.pointButton = new GeoExt.Action({
        control: new OpenLayers.Control.DrawFeature(S3.gis.draftLayer, OpenLayers.Handler.PointS3, {
            // custom Callback
            'featureAdded': function(feature) {
                // Remove previous point
                if (S3.gis.lastDraftFeature) {
                    S3.gis.lastDraftFeature.destroy();
                } else if (S3.gis.draftLayer.features.length > 1) {
                    // Clear the one from the Current Location in S3LocationSelector
                    S3.gis.draftLayer.features[0].destroy();
                }
                // update Form Fields
                var centerPoint = feature.geometry.getBounds().getCenterLonLat();
                centerPoint.transform(S3.gis.projection_current, S3.gis.proj4326);
                $('#gis_location_lon').val(centerPoint.lon);
                $('#gis_location_lat').val(centerPoint.lat);
                // Prepare in case user selects a new point
                S3.gis.lastDraftFeature = feature;
            }
        }),
        handler: function(){
            if (S3.gis.pointButton.items[0].pressed) {
                $('.olMapViewport').addClass('crosshair');
            } else {
                $('.olMapViewport').removeClass('crosshair');
            }
        },
        map: map,
        iconCls: 'drawpoint-off',
        tooltip: S3.i18n.gis_draw_feature,
        toggleGroup: 'controls',
        allowDepress: true,
        enableToggle: true,
        pressed: point_pressed
    });
    toolbar.add(S3.gis.pointButton);
}

// Polygon Control to select Areas on the Map
function addPolygonControl(toolbar, polygon_pressed) {
    // Toolbar Button
    S3.gis.polygonButton = new GeoExt.Action({
        // We'd like to use the Polygon, but this is hard to use server-side as a Resource filter
        //control: new OpenLayers.Control.DrawFeature(S3.gis.draftLayer, OpenLayers.Handler.Polygon, {
        control: new OpenLayers.Control.DrawFeature(S3.gis.draftLayer, OpenLayers.Handler.RegularPolygon, {
            handlerOptions: {
                sides: 4,
                snapAngle: 90
            },
            // custom Callback
            'featureAdded': function(feature) {
                // Remove previous polygon
                if (S3.gis.lastDraftFeature) {
                    S3.gis.lastDraftFeature.destroy();
                }
                // update Form Field
                var WKT = feature.geometry.transform(S3.gis.projection_current, S3.gis.proj4326).toString();
                $('#gis_search_polygon_input').val(WKT);
                // Prepare in case user draws a new polygon
                S3.gis.lastDraftFeature = feature;
            }
        }),
        handler: function(){
            if (S3.gis.polygonButton.items[0].pressed) {
                $('.olMapViewport').addClass('crosshair');
            } else {
                $('.olMapViewport').removeClass('crosshair');
            }
        },
        map: map,
        iconCls: 'drawpolygon-off',
        tooltip: S3.i18n.gis_draw_polygon,
        toggleGroup: 'controls',
        allowDepress: true,
        pressed: polygon_pressed,
        enableToggle: true,
        activateOnEnable: true,
        deactivateOnDisable: true
    });
    toolbar.add(S3.gis.polygonButton);
}

// Potlatch button for editing OpenStreetMap
// @ToDo: Select a Polygon for editing rather than the whole Viewport
function addPotlatchButton(toolbar) {
    // Toolbar Button
    var potlatchButton = new Ext.Toolbar.Button({
        iconCls: 'potlatch',
        tooltip: S3.i18n.gis_potlatch,
        handler: function() {
            // Read current settings from map
            var zoom_current = map.getZoom();
            if ( zoom_current < 14 ) {
                alert(S3.gis.osm_oauth);
            } else {
                var lonlat = map.getCenter();
                // Convert back to LonLat for saving
                lonlat.transform(map.getProjectionObject(), S3.gis.proj4326);
                var url = S3.Ap.concat('/gis/potlatch2/potlatch2.html') + '?lat=' + lonlat.lat + '&lon=' + lonlat.lon + '&zoom=' + zoom_current;
                window.open(url);
            }
        }
    });
    toolbar.addSeparator();
    toolbar.addButton(potlatchButton);
}

// Save button to save the Viewport settings
function addSaveButton(toolbar) {
    // Toolbar Button
    var saveButton = new Ext.Toolbar.Button({
        iconCls: 'save',
        tooltip: S3.i18n.gis_save,
        handler: function() {
            // Read current settings from map
            var lonlat = map.getCenter();
            var zoom_current = map.getZoom();
            // Convert back to LonLat for saving
            lonlat.transform(map.getProjectionObject(), S3.gis.proj4326);
            // Use AJAX to send back
            var url = S3.Ap.concat('/gis/config/' + S3.gis.region + '.url/update');
            Ext.Ajax.request({
                url: url,
                method: 'GET',
                params: {
                    lat: lonlat.lat,
                    lon: lonlat.lon,
                    zoom: zoom_current
                }
            });
        }
    });
    toolbar.addSeparator();
    toolbar.addButton(saveButton);
}

// MGRS Grid PDF Control
// select an area on the map to download the grid's PDF to print off
function addPdfControl(toolbar) {
    selectPdfControl = new OpenLayers.Control();
    OpenLayers.Util.extend( selectPdfControl, {
        draw: function () {
            this.box = new OpenLayers.Handler.Box( this, {
                    'done': this.getPdf
                });
            this.box.activate();
            },
        response: function(req) {
            this.w.destroy();
            var gml = new OpenLayers.Format.GML();
            var features = gml.read(req.responseText);
            var html = features.length + ' pdfs. <br /><ul>';
            if (features.length) {
                for (var i = 0; i < features.length; i++) {
                    var f = features[i];
                    var text = f.attributes.utm_zone + f.attributes.grid_zone + f.attributes.grid_square + f.attributes.easting + f.attributes.northing;
                    html += "<li><a href='" + features[i].attributes.url + "'>" + text + '</a></li>';
                }
            }
            html += '</ul>';
            this.w = new Ext.Window({
                'html': html,
                width: 300,
                'title': 'Results',
                height: 200
            });
            this.w.show();
        },
        getPdf: function (bounds) {
            var ll = map.getLonLatFromPixel(new OpenLayers.Pixel(bounds.left, bounds.bottom)).transform(S3.gis.projection_current, S3.gis.proj4326);
            var ur = map.getLonLatFromPixel(new OpenLayers.Pixel(bounds.right, bounds.top)).transform(S3.gis.projection_current, S3.gis.proj4326);
            var boundsgeog = new OpenLayers.Bounds(ll.lon, ll.lat, ur.lon, ur.lat);
            bbox = boundsgeog.toBBOX();
            OpenLayers.Request.GET({
                url: S3.gis.mgrs_url + '&bbox=' + bbox,
                callback: OpenLayers.Function.bind(this.response, this)
            });
            this.w = new Ext.Window({
                'html':'Searching ' + S3.gis.mgrs_name + ', please wait.',
                width: 200,
                'title': 'Please Wait.'
                });
            this.w.show();
        }
    });

    var tooltip = 'Select ' + S3.gis.mgrs_name;
    // Toolbar Button
    var mgrsButton = new GeoExt.Action({
        text: tooltip,
        control: selectPdfControl,
        map: map,
        toggleGroup: 'controls',
        allowDepress: false,
        tooltip: tooltip
        // check item options group: 'draw'
    });
    toolbar.addSeparator();
    toolbar.add(mgrsButton);
}

// WMS GetFeatureInfo control
function addWMSGetFeatureInfoControl(toolbar) {
    S3.gis.wmsGetFeatureInfo = new gxp.plugins.WMSGetFeatureInfo({
        actionTarget: 'mappnlcntr.tbar',
        outputTarget: 'map',
        outputConfig: {
            width: 400,
            height: 200
        },
        toggleGroup: 'controls',
        // html not permitted by Proxy
        format: "grid",
        infoActionTip: S3.i18n.gis_get_feature_info,
        popupTitle: S3.i18n.gis_feature_info
    });
    // Set up shortcut to allow GXP Plugin to work
    S3.gis.wmsGetFeatureInfo.target = S3.gis;
    // @ToDo: Why do we need to toggle the Measure control before this works?
    //S3.gis.wmsGetFeatureInfo.activate();
    S3.gis.wmsGetFeatureInfo.addActions();
}

// Add/Remove Layers control
function addRemoveLayersControl() {
    S3.gis.addLayersControl = new gxp.plugins.AddLayers({
        actionTarget: 'treepanel.tbar',
        // @ToDo: i18n
        addActionTip: 'Add layers',
        addActionMenuText: 'Add layers',
        addServerText: 'Add a New Server',
        doneText: 'Done',
        // @ToDo: CSW
        //search: true,
        upload: {
            // @ToDo
            url: null
        },
        uploadText: S3.i18n.gis_uploadlayer,
        relativeUploadOnly: false
    });
    
    // @ToDo: Populate this from disabled Catalogue Layers (to which the user has access)
    // Use WMStore for the GeoServer which we can write to?
    // Use current layerStore for Removelayer()?
    //var store = S3.gis.mapPanel.layers;
    var store = new GeoExt.data.LayerStore();
    
    // Set up shortcuts to allow GXP Plugin to work
    S3.gis.addLayersControl.target = S3.gis.layerTree;
    S3.gis.layerTree.proxy = OpenLayers.ProxyHost; // Required for 'Add a New Server'
    S3.gis.layerTree.layerSources = {};
    S3.gis.layerTree.layerSources['local'] = new gxp.plugins.LayerSource({
        title: 'local',
        store: store
    });
    var actions = S3.gis.addLayersControl.addActions();
    actions[0].enable();

    // @ToDo: Ensure that this picks up when a layer is highlighted
    S3.gis.removeLayerControl = new gxp.plugins.RemoveLayer({
        actionTarget: 'treepanel.tbar',
        // @ToDo: i18n
        removeActionTip: 'Remove layer'
    });
    // Set up shortcuts to allow GXP Plugin to work
    S3.gis.removeLayerControl.target = S3.gis.layerTree;
    S3.gis.layerTree.mapPanel = S3.gis.mapPanel;
    S3.gis.removeLayerControl.addActions();
}