$(function() {
    // CONFIGURATION.
    var rowsPerPage = 10;

    var resultTemplate = Handlebars.compile($('#result-template').html()),
        infoWindowTemplate = Handlebars.compile($('#info-window-template').html());

    Handlebars.registerHelper('distanceFormat', function(distance) {
        return distance.toFixed(0).toString();
    });

    // GLOBAL STATE.
    // Rows are kept sorted by distance.
    // Each has id, seq, distance, name, latlon, and street.
    var rows = [],
        map,
        mapMarkers = [],
        mapInfoWindows = [],
        pageNo = 1,
        // Farthest row we've seen so far.
        maxDistance = 0;

    // Get at most 'num' rows from server, all at least 'maxDistance' away, and
    // append to global 'rows'. Update global 'maxDistance'.
    function getMoreRows(num, callback, errback) {
        // Exclude known rows at the current maxDistance so we don't get
        // dupes from server.
        var skipIds = [];
        for (
            var i = rows.length - 1;
            i >= 0 && rows[i].distance == maxDistance;
            i--
        ) {
            skipIds.push(rows[i].id);
        }

        $.ajax({
            url: '/geopaging/results/json',
            type: 'post',
            contentType: 'application/json',

            data: JSON.stringify({
                lat: window.pageData.lat,
                lon: window.pageData.lon,
                minDistance: maxDistance,
                skipIds: skipIds,
                num: num
            })
        }).success(function(data) {
            if (data.results.length) {
                maxDistance = data.stats.maxDistance;
            }

            data.results.forEach(function(result) {
                var obj = result.obj,
                    name = (
                        obj['Camis Trade Name'] || obj['Entity Name']
                    ).toLocaleLowerCase(),
                    street = obj['Address Street Name'].toLocaleLowerCase(),
                    lonlat = obj.location.coordinates,
                    row = {
                        id: obj._id['$oid'],
                        seq: rows.length + 1,
                        distance: result.dis,
                        name: name,
                        street: street,
                        // Reorder the GeoJSON coordinates from server.
                        latlon: [lonlat[1], lonlat[0]]
                    };

                rows.push(row);
            });

            callback();

        }).error(errback);
    }

    function getRowsShown() {
        return rows.slice((pageNo - 1) * rowsPerPage, pageNo * rowsPerPage);
    }

    function updateTable(pagingDirection) {
        $('#results')
            .html(resultTemplate({rows: getRowsShown()}))
            .find('tr').click(function() {
                var rowId = $(this).attr('data-rowid');

                // Find the appropriate map info window and show it. There are at
                // most 'rowsPerPage' info windows in the array.
                for (var i = 0; i < mapInfoWindows.length; ++i) {
                    var infoWindow = mapInfoWindows[i];
                    if (infoWindow.rowId == rowId) {
                        closeAllInfoWindows();
                        infoWindow.open(map, infoWindow.marker);
                        return;
                    }
                }
            });

        $('#page-number').html(pageNo.toString());
    }

    function updateMap(pagingDirection) {
        clearMapPoints();

        var rowsShown = getRowsShown();
        addPointsToMap(rowsShown);
        var center = new google.maps.LatLng(window.pageData.lat, window.pageData.lon);
        map.setCenter(center);
        zoomMapToFit(rowsShown, pagingDirection);
    }

    // Redisplay the table and map. Get more rows from server if necessary.
    // pagingDirection is 'next' or 'previous'.
    function showPage(pageNo, pagingDirection, callback) {
        function onRowsReady() {
            updateTable(pagingDirection);
            updateMap(pagingDirection);
            if (callback) callback();
        }
        
        if (rows.length >= pageNo * rowsPerPage) {
            // We have enough rows already.
            onRowsReady();
        } else {
            getMoreRows(
                rowsPerPage,
                function() {
                    // Success.
                    onRowsReady();
                },
                function(jqXHR, textStatus, errorThrown) {
                    // Failure.
                    alert(errorThrown);
                    if (callback) callback();
                }
            );
        }
    }

    // Map stuff.
    function initializeMap() {
        var center = new google.maps.LatLng(window.pageData.lat, window.pageData.lon);
        var mapOptions = {
            zoom: 16,
            center: center,
            mapTypeId: google.maps.MapTypeId.ROADMAP
        };

        map = new google.maps.Map(
            document.getElementById('map-canvas'),
            mapOptions);

        // Center point.
        var marker = new google.maps.Marker({
            map: map,
            draggable: true,
            animation: google.maps.Animation.DROP,
            position: center
        });

        google.maps.event.addListener(marker, 'dragend', function() {
            window.pageData.lat = marker.getPosition().lat();
            window.pageData.lon = marker.getPosition().lng();

            rows = [];
            maxDistance = 0;
            pageNo = 1;

            showPage(1, 'next', function() {
                $previous.addClass('disabled');
            });
        });
    }

    google.maps.event.addDomListener(window, 'load', initializeMap);

    function makeInfoWindow(row, marker) {
        var contentString = infoWindowTemplate(row);
        var infoWindow = new google.maps.InfoWindow({content: contentString});
        infoWindow.rowId = row.id;
        infoWindow.marker = marker;
        google.maps.event.addListener(marker, 'click', function() {
            closeAllInfoWindows();
            infoWindow.open(map, marker);
        });
        return infoWindow;
    }

    function clearMapPoints() {
        mapMarkers.forEach(function(marker) {
            marker.setMap(null);
        });

        mapMarkers = [];
        closeAllInfoWindows();
        mapInfoWindows = [];
    }

    function closeAllInfoWindows() {
        mapInfoWindows.forEach(function(infoWindow) {
            infoWindow.close();
        })
    }

    // Add a list of [lat, lon] pairs.
    function addPointsToMap(rowsShown) {
        var circle = {
            path: google.maps.SymbolPath.CIRCLE,
              fillColor: "blue",
              fillOpacity: 0.5,
              scale: 6,
              strokeColor: "black",
              strokeWeight: 1
        };

        rowsShown.forEach(function(row) {
            var latlng = new google.maps.LatLng(row.latlon[0], row.latlon[1]),
                marker = new google.maps.Marker({
                    map: map,
                    draggable: false,
                    position: latlng,
                    icon: circle
                });

            mapMarkers.push(marker);
            mapInfoWindows.push(makeInfoWindow(row, marker));
        });
    }

    // points is a list of [lat, lon]. pagingDirection is 'next' or 'previous'.
    function zoomMapToFit(rowsShown, pagingDirection) {
        // Not ready?
        if ( ! rowsShown.length || ! map.getBounds()) {
            // Try later.
            google.maps.event.addListenerOnce(map, 'idle', function(){
                zoomMapToFit(rowsShown, pagingDirection);
            });

            return;
        }

        var latLngs = $.map(rowsShown, function(row) {
            return new google.maps.LatLng(row.latlon[0], row.latlon[1]);
        });

        function fits() {
            for (var i = 0; i < latLngs.length; ++i) {
                if ( ! map.getBounds().contains(latLngs[i])) return false;
            }

            return true;
        }

        var zoom = map.getZoom(),
            mapType = map.mapTypes[map.mapTypeId];

        if (pagingDirection == 'next') {
            // Zoom out.
            while ( ! fits() && zoom >= 1) { map.setZoom(--zoom); }
        } else {
            // Zoom in.
            while (fits() && zoom <= mapType.maxZoom) { map.setZoom(++zoom); }

            // Don't zoom in too far.
            map.setZoom(--zoom);
        }
    }

    // Set up previous / next buttons.
    var $previous = $('#previous'), $next = $('#next');

    $previous.click(function() {
        if (pageNo == 1) return false;

        $next.addClass('disabled');
        $previous.addClass('disabled');

        showPage(--pageNo, 'previous', function() {
            $next.removeClass('disabled');
            if (pageNo > 1) $previous.removeClass('disabled');
        });

        return false;
    });

    $next.click(function() {
        $next.addClass('disabled');
        $previous.addClass('disabled');

        showPage(++pageNo, 'next', function() {
            $previous.removeClass('disabled');
            $next.removeClass('disabled');
        });

        return false;
    });

    // Initial display.
    $previous.addClass('disabled');
    $next.addClass('disabled');
    showPage(1, 'next', function() {
        $next.removeClass('disabled');
    });
});
