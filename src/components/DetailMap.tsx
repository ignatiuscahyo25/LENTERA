import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Report } from '../types';

interface DetailMapProps {
  report: Report;
}

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function DetailMap({ report }: DetailMapProps) {
  const position: [number, number] = [report.latitude, report.longitude];

  return (
    <div className="w-full h-[320px] sm:h-[380px] md:h-[520px] rounded-lg overflow-hidden border border-[#c4c6d1]">
      <MapContainer
        center={position}
        zoom={16}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={position} icon={markerIcon}>
          <Popup>
            <div style={{ minWidth: '180px' }}>
              <strong>ID Laporan: {report.id}</strong>
              <br />
              Status: {report.status}
              <br />
              Node: {report.node}
              <br />
              Koordinat:
              <br />
              {report.latitude}, {report.longitude}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}