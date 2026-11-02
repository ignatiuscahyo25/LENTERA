import React from 'react';

import * as maplibregl from 'maplibre-gl';

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(workerUrl);

import type { Report } from '../types';

import {
  offlineStyle,
  JABODETABEK_CENTER,
  JAVA_BOUNDS
} from '../maps/offlineStyle';

// ========================================
// PROPS
// ========================================

interface DetailMapProps {
  report: Report;
}

type Coordinates = [number, number];

// ========================================
// VALIDATE GPS COORDINATES
// ========================================

function hasValidLocation(report: Report): boolean {
  return (
    report.latitude !== null &&
    report.latitude !== undefined &&
    report.longitude !== null &&
    report.longitude !== undefined &&
    Number.isFinite(report.latitude) &&
    Number.isFinite(report.longitude) &&
    report.latitude >= -90 &&
    report.latitude <= 90 &&
    report.longitude >= -180 &&
    report.longitude <= 180
  );
}

function insideCoverage(
  position: Coordinates
): boolean {
  return (
    position[0] >= JAVA_BOUNDS[0] &&
    position[1] >= JAVA_BOUNDS[1] &&
    position[0] <= JAVA_BOUNDS[2] &&
    position[1] <= JAVA_BOUNDS[3]
  );
}

// ========================================
// MARKER ICON
// ========================================

function createMarker(
  color: string
): HTMLDivElement {

  const element = document.createElement('div');

  element.style.width = '22px';
  element.style.height = '22px';
  element.style.backgroundColor = color;
  element.style.border = '3px solid white';
  element.style.borderRadius = '50%';
  element.style.boxShadow =
    '0 2px 8px rgba(0,0,0,0.35)';
  element.style.boxSizing = 'content-box';

  return element;
}

// ========================================
// ROUTE TYPES
// ========================================

interface RouteResult {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: {
      type: 'LineString';
      coordinates: number[][];
    };
  }>;
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function DetailMap({
  report
}: DetailMapProps) {

  const containerRef =
    React.useRef<HTMLDivElement | null>(null);

  const mapRef =
    React.useRef<maplibregl.Map | null>(null);

  const victimMarkerRef =
    React.useRef<maplibregl.Marker | null>(null);

  const startMarkerRef =
    React.useRef<maplibregl.Marker | null>(null);

  const choosingStartRef =
    React.useRef(false);

  const routeRequestRef =
    React.useRef<AbortController | null>(null);

  const [mapReady, setMapReady] =
    React.useState(false);

  const [choosingStart, setChoosingStart] =
    React.useState(false);

  const [startPoint, setStartPoint] =
    React.useState<Coordinates | null>(null);

  const [routeDistance, setRouteDistance] =
    React.useState<number | null>(null);

  const [routeDuration, setRouteDuration] =
    React.useState<number | null>(null);

  const [loadingRoute, setLoadingRoute] =
    React.useState(false);

  const [message, setMessage] =
    React.useState<string | null>(null);

  const [mapError, setMapError] =
    React.useState<string | null>(null);

  const validLocation =
    hasValidLocation(report);

  const latitude = validLocation
    ? report.latitude as number
    : null;

  const longitude = validLocation
    ? report.longitude as number
    : null;

  const victimPosition: Coordinates | null =
    latitude !== null && longitude !== null
      ? [longitude, latitude]
      : null;

  const victimLng = victimPosition?.[0];
  const victimLat = victimPosition?.[1];

  // ========================================
  // UPDATE CLICK MODE
  // ========================================

  React.useEffect(() => {
    choosingStartRef.current = choosingStart;
  }, [choosingStart]);

  // ========================================
  // INITIALIZE MAP
  // ========================================

  React.useEffect(() => {

    if (!containerRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: offlineStyle,
      center: JABODETABEK_CENTER,
      zoom: 10,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(),
      'top-right'
    );

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true
      }),
      'bottom-right'
    );

    map.on('load', () => {
      setMapReady(true);
      map.resize();
    });

    map.on('error', event => {
      console.error(
        '[LENTERA DETAIL MAP]',
        event.error
      );

      setMapError(
        'Data peta offline gagal dimuat. ' +
        'Periksa TileServer port 8080.'
      );
    });

    // Manual starting point selection
    map.on('click', event => {

      if (!choosingStartRef.current) {
        return;
      }

      const position: Coordinates = [
        event.lngLat.lng,
        event.lngLat.lat
      ];

      if (!insideCoverage(position)) {
        setMessage(
          'Titik awal berada di luar cakupan peta offline Jawa.'
        );
        return;
      }

      routeRequestRef.current?.abort();

      setStartPoint(position);
      setRouteDistance(null);
      setRouteDuration(null);
      setLoadingRoute(false);
      setMessage(
        'Titik awal dipilih. Tekan Cari Rute Offline.'
      );

      choosingStartRef.current = false;
      setChoosingStart(false);
    });

    return () => {
      routeRequestRef.current?.abort();

      victimMarkerRef.current?.remove();
      startMarkerRef.current?.remove();

      mapRef.current = null;

      map.remove();
    };

  }, []);

  // ========================================
  // UPDATE VICTIM MARKER
  // ========================================

  React.useEffect(() => {

    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    victimMarkerRef.current?.remove();
    victimMarkerRef.current = null;

    if (victimPosition) {

      const popupContent =
        document.createElement('div');

      popupContent.style.fontSize = '12px';
      popupContent.style.lineHeight = '1.8';

      const data = [
        ['ID Laporan', String(report.messageId ?? report.id)],
        ['Status', String(report.status)],
        ['Node', String(report.node)],
        ['Jumlah Korban', `${report.victimCount} orang`],
        [
          'Sumber Lokasi',
          String(report.locationSource || 'UNKNOWN')
        ],
        [
          'Koordinat',
          `${victimPosition[1]}, ${victimPosition[0]}`
        ]
      ];

      if (
        report.locationAccuracy !== null &&
        report.locationAccuracy !== undefined
      ) {
        data.push([
          'Akurasi',
          `${report.locationAccuracy} meter`
        ]);
      }

      data.forEach(([label, value]) => {
        const row = document.createElement('div');

        const bold = document.createElement('strong');
        bold.textContent = `${label}: `;

        row.appendChild(bold);
        row.appendChild(document.createTextNode(value));

        popupContent.appendChild(row);
      });

      victimMarkerRef.current =
        new maplibregl.Marker({
          element: createMarker('#dc2626')
        })
          .setLngLat(victimPosition)
          .setPopup(
            new maplibregl.Popup({
              offset: 16
            }).setDOMContent(popupContent)
          )
          .addTo(map);

      map.jumpTo({
        center: victimPosition,
        zoom: 15
      });

    } else {

      map.jumpTo({
        center: JABODETABEK_CENTER,
        zoom: 10
      });
    }

  }, [
    mapReady,
    victimLng,
    victimLat,
    report.id,
    report.messageId,
    report.status,
    report.node,
    report.victimCount,
    report.locationSource,
    report.locationAccuracy
  ]);

  // ========================================
  // UPDATE START MARKER
  // ========================================

  React.useEffect(() => {

    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    startMarkerRef.current?.remove();
    startMarkerRef.current = null;

    if (!startPoint) {
      return;
    }

    startMarkerRef.current =
      new maplibregl.Marker({
        element: createMarker('#2563eb')
      })
        .setLngLat(startPoint)
        .setPopup(
          new maplibregl.Popup({
            offset: 14
          }).setText('Titik awal tim SAR')
        )
        .addTo(map);

  }, [startPoint, mapReady]);

  // ========================================
  // ROUTE DISPLAY HELPERS
  // ========================================

  const clearRouteLayer = React.useCallback(() => {

    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    if (map.getLayer('lentera-route-line')) {
      map.removeLayer('lentera-route-line');
    }

    if (map.getSource('lentera-route')) {
      map.removeSource('lentera-route');
    }

  }, [mapReady]);

  // ========================================
  // RESET ROUTE WHEN REPORT CHANGES
  // ========================================

  React.useEffect(() => {

    routeRequestRef.current?.abort();

    setStartPoint(null);
    setChoosingStart(false);
    choosingStartRef.current = false;
    setRouteDistance(null);
    setRouteDuration(null);
    setLoadingRoute(false);
    setMessage(null);

    clearRouteLayer();

  }, [report.id, victimLng, victimLat, clearRouteLayer]);

  // ========================================
  // FIND ROUTE USING LOCAL OSRM
  // ========================================

  const findRoute = async () => {

    const map = mapRef.current;

    if (!map || !mapReady) {
      setMessage('Peta belum siap.');
      return;
    }

    if (!victimPosition) {
      setMessage(
        'Koordinat korban belum tersedia.'
      );
      return;
    }

    if (!startPoint) {
      setMessage(
        'Pilih titik awal tim SAR terlebih dahulu.'
      );
      return;
    }

    if (
      !insideCoverage(startPoint) ||
      !insideCoverage(victimPosition)
    ) {
      setMessage(
        'Titik awal atau korban berada di luar cakupan peta offline.'
      );
      return;
    }

    routeRequestRef.current?.abort();
    clearRouteLayer();

    setRouteDistance(null);
    setRouteDuration(null);
    setLoadingRoute(true);
    setMessage('Menghitung rute offline...');

    const controller = new AbortController();
    routeRequestRef.current = controller;

    const host =
      window.location.hostname || 'localhost';

    // OSRM lokal, port 5000.
    // Akan aktif setelah OSRM dipasang.
    const routeUrl =
      `http://${host}:5000/route/v1/driving/` +
      `${startPoint[0]},${startPoint[1]};` +
      `${victimPosition[0]},${victimPosition[1]}` +
      '?overview=full&geometries=geojson&steps=true';

    try {

      const response = await fetch(routeUrl, {
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(
          `OSRM HTTP ${response.status}`
        );
      }

      const result =
        await response.json() as RouteResult;

      if (
        result.code !== 'Ok' ||
        !result.routes?.length
      ) {
        throw new Error(
          'Rute tidak ditemukan.'
        );
      }

      const route = result.routes[0];

      if (
        route.geometry.type !== 'LineString' ||
        route.geometry.coordinates.length < 2 ||
        !Number.isFinite(route.distance) ||
        !Number.isFinite(route.duration)
      ) {
        throw new Error(
          'Data rute tidak valid.'
        );
      }

      if (controller.signal.aborted) {
        return;
      }

      const routeData = {
        type: 'FeatureCollection' as const,
        features: [{
          type: 'Feature' as const,
          properties: {},
          geometry: route.geometry
        }]
      };

      map.addSource('lentera-route', {
        type: 'geojson',
        data: routeData
      });

      map.addLayer({
        id: 'lentera-route-line',
        type: 'line',
        source: 'lentera-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#2563eb',
          'line-width': 5,
          'line-opacity': 0.9
        }
      });

      const bounds =
        new maplibregl.LngLatBounds();

      route.geometry.coordinates.forEach(
        coordinate => {
          bounds.extend([
            coordinate[0],
            coordinate[1]
          ]);
        }
      );

      map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
        duration: 500
      });

      setRouteDistance(route.distance);
      setRouteDuration(route.duration);

      setMessage(
        'Rute berhasil dihitung. ' +
        'Pastikan kondisi jalan aman sebelum berangkat.'
      );

    } catch (error) {

      if (controller.signal.aborted) {
        return;
      }

      console.error('[LENTERA ROUTE]', error);

      setMessage(
        'Rute offline belum tersedia. ' +
        'Pastikan OSRM lokal telah terpasang ' +
        'dan berjalan pada port 5000.'
      );

    } finally {

      if (routeRequestRef.current === controller) {
        routeRequestRef.current = null;
        setLoadingRoute(false);
      }
    }
  };

  // ========================================
  // CLEAR ROUTE
  // ========================================

  const resetRoute = () => {

    routeRequestRef.current?.abort();

    clearRouteLayer();

    setStartPoint(null);
    setChoosingStart(false);
    choosingStartRef.current = false;
    setRouteDistance(null);
    setRouteDuration(null);
    setLoadingRoute(false);
    setMessage(null);
  };

  // ========================================
  // UI
  // ========================================

  return (

    <div className="space-y-3">

      <div
        className="
          relative
          w-full
          h-[320px]
          sm:h-[380px]
          md:h-[520px]
          rounded-lg
          overflow-hidden
          border
          border-[#c4c6d1]
          bg-[#e0f2fe]
        "
      >

        <div
          ref={containerRef}
          className="w-full h-full"
          style={{
            cursor: choosingStart
              ? 'crosshair'
              : 'grab'
          }}
        />

        {mapError && (
          <div
            className="
              absolute top-3 left-3 right-14 z-10
              bg-white/95 border border-red-300
              text-red-700 text-xs rounded p-2
            "
          >
            {mapError}
          </div>
        )}

        {!validLocation && (
          <div
            className="
              absolute bottom-3 left-3 right-3 z-10
              bg-white/95 border border-[#c4c6d1]
              rounded-lg p-4 shadow-md
              pointer-events-none
            "
          >

            <p className="text-sm font-bold text-[#00193c]">
              Lokasi korban belum tersedia
            </p>

            <p className="text-xs text-[#43474f] mt-2">
              Laporan SOS telah diterima LENTERA,
              tetapi belum memiliki koordinat GPS/GNSS
              yang valid. Peta offline tetap tersedia.
            </p>

            <p className="text-[10px] font-mono mt-2">
              LOCATION SOURCE:{' '}
              {report.locationSource || 'UNAVAILABLE'}
            </p>

          </div>
        )}

        {validLocation && (
          <div
            className="
              absolute bottom-3 left-3 z-10
              bg-white/95 border border-[#c4c6d1]
              rounded-lg px-3 py-2 shadow-md
              pointer-events-none
            "
          >

            <p className="text-xs font-bold text-[#00193c]">
              Lokasi SOS
            </p>

            <p className="text-[11px] font-mono text-[#43474f] mt-1">
              {latitude}, {longitude}
            </p>

            <p className="text-[10px] text-[#43474f] mt-1">
              {report.locationSource || 'UNKNOWN'}
            </p>

          </div>
        )}

      </div>

      {/* ==================================
          MANUAL ROUTING CONTROLS
          ================================== */}

      <div
        className="
          bg-white
          border border-[#c4c6d1]
          rounded-lg
          p-3
          space-y-3
        "
      >

        <p className="text-xs font-bold text-[#00193c]">
          Navigasi Offline Tim SAR
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">

          <button
            type="button"
            disabled={!validLocation || !mapReady}
            onClick={() => {
              setChoosingStart(true);
              choosingStartRef.current = true;
              setMessage(
                'Klik lokasi keberangkatan tim SAR pada peta.'
              );
            }}
            className="
              px-3 py-2 rounded text-xs font-bold
              bg-[#00193c] text-white
              disabled:opacity-50
              disabled:cursor-not-allowed
            "
          >
            {choosingStart
              ? 'Klik Peta Sekarang'
              : 'Pilih Titik Awal'}
          </button>

          <button
            type="button"
            disabled={
              !validLocation ||
              !mapReady ||
              !startPoint ||
              loadingRoute
            }
            onClick={findRoute}
            className="
              px-3 py-2 rounded text-xs font-bold
              bg-[#2563eb] text-white
              disabled:opacity-50
              disabled:cursor-not-allowed
            "
          >
            {loadingRoute
              ? 'Menghitung...'
              : 'Cari Rute Offline'}
          </button>

          <button
            type="button"
            disabled={!startPoint && !choosingStart}
            onClick={resetRoute}
            className="
              px-3 py-2 rounded text-xs font-bold
              border border-[#c4c6d1]
              text-[#00193c]
              disabled:opacity-50
            "
          >
            Hapus / Ulangi
          </button>

        </div>

        {startPoint && (
          <p className="text-[11px] text-[#43474f] font-mono">
            Titik awal:{' '}
            {startPoint[1].toFixed(6)},{' '}
            {startPoint[0].toFixed(6)}
          </p>
        )}

        {routeDistance !== null &&
          routeDuration !== null && (

          <div className="text-xs font-semibold text-[#00193c]">
            Jarak: {(routeDistance / 1000).toFixed(2)} km
            {' · '}
            Estimasi: {Math.ceil(routeDuration / 60)} menit
          </div>
        )}

        {message && (
          <p className="text-xs text-[#43474f]">
            {message}
          </p>
        )}

        <p className="text-[10px] text-[#64748b]">
          Titik merah: korban. Titik biru: posisi awal tim SAR.
          Rute adalah referensi jaringan jalan, bukan
          jaminan jalan aman atau dapat dilalui.
        </p>

      </div>

    </div>
  );
}
