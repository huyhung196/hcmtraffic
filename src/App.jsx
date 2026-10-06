import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { getCameraImageUrl } from './utils/helpers'

// Fix leaflet icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const HCMC_CENTER = { lat: 10.7769, lon: 106.7009 }

// Primary: Photon (OSM data, CORS-enabled). Fallback: Nominatim.
async function searchPlaces(q, signal) {
  try {
    const params = new URLSearchParams({
      q,
      limit: '10',
      lat: HCMC_CENTER.lat,
      lon: HCMC_CENTER.lon,
      location_bias_scale: '0.5',
    })
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.features
      .filter(f => f.properties.countrycode === 'VN')
      .slice(0, 6)
      .map(f => {
        const p = f.properties
        const [lng, lat] = f.geometry.coordinates
        const street = [p.housenumber, p.street].filter(Boolean).join(' ')
        const title = p.name || street || p.district || 'Địa điểm'
        const subtitle = [p.name && street, p.district, p.city || p.state]
          .filter(Boolean)
          .join(', ')
        const e = p.extent
        const bounds = e && (Math.abs(e[2] - e[0]) > 0.002 || Math.abs(e[1] - e[3]) > 0.002)
          ? [[e[3], e[0]], [e[1], e[2]]]
          : null
        return { id: `${p.osm_type}${p.osm_id}`, lat, lng, bounds, title, subtitle }
      })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      countrycodes: 'vn',
      limit: '6',
      'accept-language': 'vi',
    })
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.map(d => {
      const bb = d.boundingbox?.map(Number)
      const parts = d.display_name.split(',').map(s => s.trim())
      return {
        id: String(d.place_id),
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        bounds: bb && (bb[1] - bb[0] > 0.002 || bb[3] - bb[2] > 0.002) ? [[bb[0], bb[2]], [bb[1], bb[3]]] : null,
        title: parts.slice(0, 2).join(', '),
        subtitle: parts.slice(2).join(', '),
      }
    })
  }
}

async function fetchRoute(start, end) {
  const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'false',
  })
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('Route not found')
  return data.routes[0]
}

function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours} giờ${remainingMinutes ? ` ${remainingMinutes} phút` : ''}`
}

function getCamerasAlongRoute(cameras, routeCoordinates, maxDistanceMeters = 250) {
  const earthRadius = 6371000
  const toRadians = value => value * Math.PI / 180
  const referenceLatitude = routeCoordinates.reduce((sum, point) => sum + point[0], 0) / routeCoordinates.length
  const latitudeScale = earthRadius * Math.PI / 180
  const longitudeScale = latitudeScale * Math.cos(toRadians(referenceLatitude))
  const points = routeCoordinates.map(([lat, lng]) => ({
    x: lng * longitudeScale,
    y: lat * latitudeScale,
  }))
  const cumulativeDistances = [0]

  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index].x - points[index - 1].x
    const dy = points[index].y - points[index - 1].y
    cumulativeDistances[index] = cumulativeDistances[index - 1] + Math.hypot(dx, dy)
  }

  return cameras
    .map(camera => {
      const cameraPoint = {
        x: camera.Lng * longitudeScale,
        y: camera.Lat * latitudeScale,
      }
      let closestDistance = Infinity
      let distanceFromStart = 0

      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1]
        const end = points[index]
        const segmentX = end.x - start.x
        const segmentY = end.y - start.y
        const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
        const projection = segmentLengthSquared === 0
          ? 0
          : Math.max(0, Math.min(1, (
              (cameraPoint.x - start.x) * segmentX + (cameraPoint.y - start.y) * segmentY
            ) / segmentLengthSquared))
        const projectedX = start.x + projection * segmentX
        const projectedY = start.y + projection * segmentY
        const distance = Math.hypot(cameraPoint.x - projectedX, cameraPoint.y - projectedY)

        if (distance < closestDistance) {
          closestDistance = distance
          distanceFromStart = cumulativeDistances[index - 1] + Math.sqrt(segmentLengthSquared) * projection
        }
      }

      return { camera, closestDistance, distanceFromStart }
    })
    .filter(item => item.closestDistance <= maxDistanceMeters)
    .sort((a, b) => a.distanceFromStart - b.distanceFromStart)
}

export default function App() {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Address search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [startMode, setStartMode] = useState('location')
  const [startQuery, setStartQuery] = useState('')
  const [startResults, setStartResults] = useState([])
  const [startSearching, setStartSearching] = useState(false)
  const [startSearchError, setStartSearchError] = useState('')
  const [startDropdownOpen, setStartDropdownOpen] = useState(false)
  const [selectedStartPlace, setSelectedStartPlace] = useState(null)
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [userLocation, setUserLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [routeSummary, setRouteSummary] = useState(null)
  const [routeCameras, setRouteCameras] = useState([])

  const mapRef = useRef(null)
  const mapContainerRef = useRef(null)
  const clusterRef = useRef(null)
  const placeMarkerRef = useRef(null)
  const startMarkerRef = useRef(null)
  const userMarkerRef = useRef(null)
  const accuracyCircleRef = useRef(null)
  const routeLayerRef = useRef(null)
  const cameraMarkersRef = useRef(new Map())

  // Load cameras
  useEffect(() => {
    fetch('/cameras.json')
      .then(res => res.json())
      .then(data => {
        const valid = data.filter(c => c.Lat && c.Lng)
        setCameras(valid)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load cameras:', err)
        setLoading(false)
      })
  }, [])

  // Init map AFTER loading is done and container exists
  useEffect(() => {
    if (loading || !mapContainerRef.current || mapRef.current) return

    const leafletMap = L.map(mapContainerRef.current, {
      center: [10.7769, 106.7009],
      zoom: 13,
      zoomControl: false,
    })
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(leafletMap)

    const markerCluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 17,
      iconCreateFunction: () => {
        const size = 46
        return L.divIcon({
          html: `<div style="
            width: ${size}px;
            height: ${size}px;
            background: linear-gradient(135deg, #ec4899, #db2777);
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 3px 12px rgba(219,39,119,0.45), 0 0 0 5px rgba(236,72,153,0.18), 0 0 0 9px rgba(236,72,153,0.08);
          ">
            <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </div>`,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size/2, size/2],
        })
      }
    })

    leafletMap.addLayer(markerCluster)
    mapRef.current = leafletMap
    clusterRef.current = markerCluster

    return () => {
      leafletMap.remove()
      mapRef.current = null
      clusterRef.current = null
    }
  }, [loading])

  // Update markers when cameras change
  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return

    cluster.clearLayers()
    cameraMarkersRef.current.clear()

    cameras.forEach(camera => {
      const isLive = camera.VideoStreaming
      const color = isLive ? '#10b981' : '#ec4899'

      const icon = L.divIcon({
        html: `
          <div style="
            width: 36px;
            height: 36px;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 3px 10px ${isLive ? 'rgba(16,185,129,0.5)' : 'rgba(236,72,153,0.5)'};
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </div>
        `,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18],
      })

      const marker = L.marker([camera.Lat, camera.Lng], { icon })

      const popupContent = `
        <div style="min-width: 320px; font-family: system-ui, sans-serif;">
          <div style="padding: 16px; background: linear-gradient(135deg, #fdf2f8, #fce7f3); border-radius: 12px 12px 0 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #1e293b; line-height: 1.4;">
              ${camera.CamName}
            </h3>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <span style="padding: 4px 12px; background: white; border-radius: 20px; font-size: 12px; font-weight: 600; color: #64748b;">
                ${camera.District || 'TP.HCM'}
              </span>
              ${camera.Code ? `<span style="padding: 4px 12px; background: #dbeafe; border-radius: 20px; font-size: 12px; font-weight: 600; color: #3b82f6;">${camera.Code}</span>` : ''}
              ${isLive ? `<span style="padding: 4px 12px; background: #d1fae5; border-radius: 20px; font-size: 12px; font-weight: 700; color: #059669;">● LIVE</span>` : ''}
            </div>
          </div>
          <div style="background: #f1f5f9; padding: 4px;">
            <img
              src="${getCameraImageUrl(camera.SnapshotUrl)}"
              data-fallback="${camera.FallbackSnapshotUrl || ''}"
              alt="${camera.CamName}"
              referrerpolicy="no-referrer"
              style="width: 100%; height: 200px; object-fit: cover; display: block;"
              onerror="if (this.dataset.fallback && !this.dataset.fallbackUsed) { this.dataset.fallbackUsed='true'; this.src=this.dataset.fallback; } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }"
            />
            <div style="display: none; height: 200px; align-items: center; justify-content: center; color: #94a3b8; font-size: 14px;">
              Không tải được hình ảnh
            </div>
          </div>
          <div style="padding: 12px; background: white; border-radius: 0 0 12px 12px; display: flex; gap: 8px;">
            <button onclick="window.open('${camera.SnapshotUrl}', '_blank')" style="
              flex: 1;
              padding: 12px;
              background: #ec4899;
              border: none;
              border-radius: 8px;
              color: white;
              font-weight: 600;
              font-size: 14px;
              cursor: pointer;
            ">Xem ảnh gốc</button>
            <button onclick="navigator.clipboard.writeText('${camera.Lat}, ${camera.Lng}').then(() => alert('Đã copy tọa độ!'))" style="
              padding: 12px 16px;
              background: #f1f5f9;
              border: none;
              border-radius: 8px;
              color: #475569;
              font-weight: 600;
              font-size: 14px;
              cursor: pointer;
            ">Copy tọa độ</button>
          </div>
        </div>
      `

      marker.bindPopup(popupContent, {
        maxWidth: 400,
        minWidth: 320,
        className: 'custom-popup',
      })

      cluster.addLayer(marker)
      cameraMarkersRef.current.set(camera.CamId, marker)
    })
  }, [cameras])

  // Address search (Nominatim), debounced; only runs while the user types
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      setSearching(false)
      setSearchError('')
      return
    }

    const controller = new AbortController()
    setSearching(true)
    setSearchError('')

    const timer = setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then(places => {
          setResults(places)
          setSearching(false)
        })
        .catch(err => {
          if (err.name === 'AbortError') return
          setSearchError('Không kết nối được dịch vụ tìm địa chỉ, kiểm tra mạng rồi thử lại')
          setResults([])
          setSearching(false)
        })
    }, 400)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    const q = startQuery.trim()
    if (startMode !== 'address' || q.length < 3) {
      setStartResults([])
      setStartSearching(false)
      setStartSearchError('')
      return
    }

    const controller = new AbortController()
    setStartSearching(true)
    setStartSearchError('')

    const timer = setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then(places => {
          setStartResults(places)
          setStartSearching(false)
        })
        .catch(err => {
          if (err.name === 'AbortError') return
          setStartSearchError('Không kết nối được dịch vụ tìm địa chỉ')
          setStartResults([])
          setStartSearching(false)
        })
    }, 400)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [startQuery, startMode])

  const goToPlace = useCallback((place) => {
    const map = mapRef.current
    if (!map) return

    const { lat, lng, bounds } = place

    if (placeMarkerRef.current) placeMarkerRef.current.remove()
    placeMarkerRef.current = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="font-size: 32px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">📍</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 30],
      }),
    }).addTo(map)

    if (bounds) {
      map.flyToBounds(bounds, { maxZoom: 17, duration: 1 })
    } else {
      map.flyTo([lat, lng], 17, { duration: 1 })
    }

    setQuery(place.title)
    setSelectedPlace(place)
    setRouteError('')
    setRouteSummary(null)
    setRouteCameras([])
    if (routeLayerRef.current) {
      routeLayerRef.current.remove()
      routeLayerRef.current = null
    }
    setDropdownOpen(false)
  }, [])

  const clearSearch = useCallback(() => {
    setQuery('')
    setResults([])
    setSelectedPlace(null)
    setDropdownOpen(false)
    if (placeMarkerRef.current) {
      placeMarkerRef.current.remove()
      placeMarkerRef.current = null
    }
  }, [])

  const goToStartPlace = useCallback((place) => {
    const map = mapRef.current
    if (!map) return

    if (startMarkerRef.current) startMarkerRef.current.remove()
    startMarkerRef.current = L.marker([place.lat, place.lng], {
      icon: L.divIcon({
        html: '<div class="route-point-marker route-start-marker">A</div>',
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      zIndexOffset: 900,
    }).addTo(map).bindTooltip('Nơi đi', { direction: 'top', offset: [0, -12] })

    setSelectedStartPlace(place)
    setStartQuery(place.title)
    setStartDropdownOpen(false)
    setRouteError('')
    map.flyTo([place.lat, place.lng], 16, { duration: 0.8 })
  }, [])

  const locateUser = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    if (!navigator.geolocation) {
      setLocationError('Trình duyệt không hỗ trợ định vị')
      return
    }

    setLocating(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }

        setUserLocation(location)
        setLocating(false)

        if (userMarkerRef.current) userMarkerRef.current.remove()
        if (accuracyCircleRef.current) accuracyCircleRef.current.remove()

        accuracyCircleRef.current = L.circle([location.lat, location.lng], {
          radius: location.accuracy,
          color: '#2563eb',
          fillColor: '#60a5fa',
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(map)

        userMarkerRef.current = L.marker([location.lat, location.lng], {
          icon: L.divIcon({
            html: '<div class="user-location-marker"><div></div></div>',
            className: '',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
          zIndexOffset: 1000,
        }).addTo(map).bindTooltip('Vị trí của tôi', { direction: 'top', offset: [0, -12] })

        map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 16), { duration: 1 })
      },
      (error) => {
        setLocating(false)
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Bạn chưa cho phép truy cập vị trí')
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError('Không xác định được vị trí hiện tại')
        } else {
          setLocationError('Định vị mất quá nhiều thời gian, vui lòng thử lại')
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  }, [])

  const useCurrentLocation = useCallback(() => {
    setStartMode('location')
    setSelectedStartPlace(null)
    setStartQuery('')
    setStartDropdownOpen(false)
    if (startMarkerRef.current) {
      startMarkerRef.current.remove()
      startMarkerRef.current = null
    }
    locateUser()
  }, [locateUser])

  const clearRoute = useCallback(() => {
    if (routeLayerRef.current) {
      routeLayerRef.current.remove()
      routeLayerRef.current = null
    }
    setRouteSummary(null)
    setRouteCameras([])
    setRouteError('')
  }, [])

  const openRouteCamera = useCallback((camera) => {
    const map = mapRef.current
    const marker = cameraMarkersRef.current.get(camera.CamId)
    if (!map || !marker) return

    map.flyTo([camera.Lat, camera.Lng], Math.max(map.getZoom(), 17), { duration: 0.8 })
    window.setTimeout(() => marker.openPopup(), 500)
  }, [])

  const findRoute = useCallback(async () => {
    const map = mapRef.current
    if (!map || !selectedPlace) {
      setRouteError('Hãy tìm và chọn một điểm đến')
      return
    }
    const routeStart = startMode === 'location' ? userLocation : selectedStartPlace
    if (!routeStart) {
      setRouteError(startMode === 'location' ? 'Hãy xác định vị trí của bạn trước' : 'Hãy chọn địa chỉ nơi đi')
      if (startMode === 'location') locateUser()
      return
    }

    setRouting(true)
    setRouteError('')
    try {
      const route = await fetchRoute(routeStart, selectedPlace)
      const latLngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])

      if (routeLayerRef.current) routeLayerRef.current.remove()
      routeLayerRef.current = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.9,
        lineJoin: 'round',
      }).addTo(map)

      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] })
      setRouteSummary({ distance: route.distance, duration: route.duration })
      setRouteCameras(getCamerasAlongRoute(cameras, latLngs))
    } catch {
      clearRoute()
      setRouteError('Không tìm được tuyến đường, vui lòng thử lại')
    } finally {
      setRouting(false)
    }
  }, [selectedPlace, userLocation, selectedStartPlace, startMode, locateUser, clearRoute, cameras])

  // Stats
  const stats = useMemo(() => ({
    total: cameras.length,
    live: cameras.filter(c => c.VideoStreaming).length,
    districts: [...new Set(cameras.map(c => c.District).filter(Boolean))].length,
  }), [cameras])

  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #fdf2f8, #ede9fe, #dbeafe)',
        flexDirection: 'column',
        gap: 24,
      }}>
        <div style={{
          width: 80,
          height: 80,
          background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 40px rgba(139,92,246,0.3)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
        </div>
        <p style={{ color: '#64748b', fontSize: 18 }}>Đang tải dữ liệu camera...</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Left panel */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        width: 320,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto',
        zIndex: 1000,
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          padding: 14,
          background: 'linear-gradient(135deg, #fdf2f8, #fce7f3)',
          borderRadius: sidebarOpen ? '16px 16px 0 0' : 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              background: 'linear-gradient(135deg, #ec4899, #db2777)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(219,39,119,0.3)',
              flexShrink: 0,
            }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="white">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>Camera Giao Thông</h1>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>TP. Hồ Chí Minh</p>
            </div>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              aria-label={sidebarOpen ? 'Thu gọn' : 'Mở rộng'}
              style={{
                border: 'none',
                background: 'white',
                color: '#64748b',
                width: 28,
                height: 28,
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}
            >{sidebarOpen ? '–' : '+'}</button>
          </div>

          {sidebarOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
              {[
                { value: stats.total, label: 'CAMERA', color: '#ec4899' },
                { value: stats.live, label: 'LIVE', color: '#10b981' },
                { value: stats.districts, label: 'QUẬN', color: '#8b5cf6' },
              ].map(s => (
                <div key={s.label} style={{
                  background: 'white',
                  borderRadius: 10,
                  padding: '8px 6px',
                  textAlign: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {sidebarOpen && (
          <div style={{ padding: 12, position: 'relative' }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 5 }}>NƠI ĐI</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, padding: 3, borderRadius: 10, background: '#f1f5f9' }}>
                <button
                  onClick={useCurrentLocation}
                  style={{
                    height: 32,
                    border: 'none',
                    borderRadius: 8,
                    background: startMode === 'location' ? 'white' : 'transparent',
                    color: startMode === 'location' ? '#1d4ed8' : '#64748b',
                    boxShadow: startMode === 'location' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >Vị trí của tôi</button>
                <button
                  onClick={() => {
                    setStartMode('address')
                    setLocationError('')
                  }}
                  style={{
                    height: 32,
                    border: 'none',
                    borderRadius: 8,
                    background: startMode === 'address' ? 'white' : 'transparent',
                    color: startMode === 'address' ? '#1d4ed8' : '#64748b',
                    boxShadow: startMode === 'address' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >Nhập địa chỉ</button>
              </div>
            </div>

            {startMode === 'address' && (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: 12,
                  padding: '0 10px',
                  height: 38,
                  background: '#f8fafc',
                }}>
                  <span style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#2563eb',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    marginRight: 8,
                  }}>A</span>
                  <input
                    type="text"
                    placeholder="Nhập địa chỉ nơi đi..."
                    value={startQuery}
                    onChange={(event) => {
                      setStartQuery(event.target.value)
                      setSelectedStartPlace(null)
                      setStartDropdownOpen(true)
                    }}
                    onFocus={() => setStartDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setStartDropdownOpen(false), 150)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setStartDropdownOpen(false)
                      if (event.key === 'Enter' && startResults[0]) goToStartPlace(startResults[0])
                    }}
                    style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: '#1e293b' }}
                  />
                  {startQuery && (
                    <button
                      onClick={() => {
                        setStartQuery('')
                        setStartResults([])
                        setSelectedStartPlace(null)
                        if (startMarkerRef.current) {
                          startMarkerRef.current.remove()
                          startMarkerRef.current = null
                        }
                      }}
                      aria-label="Xóa nơi đi"
                      style={{ border: 'none', background: '#e2e8f0', color: '#64748b', width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', fontSize: 13 }}
                    >×</button>
                  )}
                </div>

                {startDropdownOpen && startQuery.trim().length >= 3 && (
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 44,
                    background: 'white',
                    borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    border: '1px solid #f1f5f9',
                    maxHeight: 220,
                    overflowY: 'auto',
                    zIndex: 20,
                  }}>
                    {startSearching && <div style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>Đang tìm...</div>}
                    {!startSearching && startSearchError && <div style={{ padding: '12px 14px', fontSize: 13, color: '#dc2626' }}>{startSearchError}</div>}
                    {!startSearching && !startSearchError && startResults.length === 0 && <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>Không tìm thấy địa chỉ</div>}
                    {!startSearching && startResults.map((place, index) => (
                      <button
                        key={place.id}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          goToStartPlace(place)
                        }}
                        style={{
                          width: '100%',
                          border: 'none',
                          borderTop: index ? '1px solid #f1f5f9' : 'none',
                          background: 'white',
                          padding: '9px 12px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{place.title}</span>
                        {place.subtitle && <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>{place.subtitle}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 5 }}>ĐIỂM ĐẾN</div>
            <div style={{ position: 'relative' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              border: '1.5px solid #e2e8f0',
              borderRadius: 12,
              padding: '0 10px',
              height: 38,
              background: '#f8fafc',
            }}>
              <span style={{ fontSize: 13, marginRight: 8 }}>🔍</span>
              <input
                type="text"
                placeholder="Tìm địa chỉ, đường, địa điểm..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setDropdownOpen(true)
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setDropdownOpen(false)
                  if (e.key === 'Enter' && results[0]) goToPlace(results[0])
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  fontSize: 14,
                  background: 'transparent',
                  color: '#1e293b',
                }}
              />
              {query && (
                <button
                  onClick={clearSearch}
                  aria-label="Xóa"
                  style={{
                    border: 'none',
                    background: '#e2e8f0',
                    color: '#64748b',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontSize: 13,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >×</button>
              )}
            </div>

            {dropdownOpen && query.trim().length >= 3 && (
              <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 44,
                background: 'white',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                border: '1px solid #f1f5f9',
                maxHeight: 300,
                overflowY: 'auto',
                zIndex: 10,
              }}>
                {searching && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>Đang tìm...</div>
                )}
                {!searching && searchError && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: '#dc2626' }}>{searchError}</div>
                )}
                {!searching && !searchError && results.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>Không tìm thấy địa chỉ</div>
                )}
                {!searching && results.map((place, i) => (
                  <div
                    key={place.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      goToPlace(place)
                    }}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '9px 12px',
                      cursor: 'pointer',
                      borderTop: i ? '1px solid #f1f5f9' : 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fdf2f8' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                  >
                    <span style={{ fontSize: 14 }}>📍</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{place.title}</div>
                      {place.subtitle && (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.3, marginTop: 1 }}>{place.subtitle}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <button
                onClick={useCurrentLocation}
                disabled={locating}
                style={{
                  height: 38,
                  border: '1px solid #bfdbfe',
                  borderRadius: 10,
                  background: userLocation ? '#eff6ff' : 'white',
                  color: '#1d4ed8',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: locating ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  <circle cx="12" cy="12" r="8" />
                </svg>
                {locating ? 'Đang định vị...' : startMode === 'location' ? 'Định vị lại' : 'Dùng GPS'}
              </button>
              <button
                onClick={findRoute}
                disabled={routing || !selectedPlace}
                style={{
                  height: 38,
                  border: 'none',
                  borderRadius: 10,
                  background: routing || !selectedPlace ? '#cbd5e1' : '#2563eb',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: routing || !selectedPlace ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 17h4a3 3 0 0 0 3-3V7a3 3 0 0 1 3-3h4" />
                  <path d="m16 1 3 3-3 3M5 14l-3 3 3 3" />
                </svg>
                {routing ? 'Đang tìm đường...' : 'Tìm đường'}
              </button>
            </div>

            {(locationError || routeError) && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>
                {locationError || routeError}
              </div>
            )}

            {routeSummary && (
              <div style={{
                marginTop: 8,
                padding: '10px 12px',
                borderRadius: 10,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TUYẾN ĐƯỜNG Ô TÔ</div>
                  <div style={{ fontSize: 14, color: '#1e3a8a', fontWeight: 800, marginTop: 2 }}>
                    {formatDistance(routeSummary.distance)} · {formatDuration(routeSummary.duration)}
                  </div>
                </div>
                <button
                  onClick={clearRoute}
                  aria-label="Xóa tuyến đường"
                  title="Xóa tuyến đường"
                  style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 20, cursor: 'pointer', padding: 4 }}
                >×</button>
              </div>
            )}

            {routeSummary && (
              <div style={{
                marginTop: 8,
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                overflow: 'hidden',
                background: 'white',
              }}>
                <div style={{
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f8fafc',
                  borderBottom: routeCameras.length ? '1px solid #e2e8f0' : 'none',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>CAMERA TRÊN TUYẾN</span>
                  <span style={{
                    minWidth: 22,
                    height: 22,
                    padding: '0 6px',
                    borderRadius: 11,
                    background: '#dbeafe',
                    color: '#1d4ed8',
                    fontSize: 11,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>{routeCameras.length}</span>
                </div>

                {routeCameras.length === 0 ? (
                  <div style={{ padding: '10px', color: '#94a3b8', fontSize: 12 }}>
                    Không có camera nào gần tuyến đường này.
                  </div>
                ) : (
                  <div style={{ maxHeight: 210, overflowY: 'auto' }}>
                    {routeCameras.map(({ camera, distanceFromStart, closestDistance }, index) => (
                      <button
                        key={camera.CamId}
                        onClick={() => openRouteCamera(camera)}
                        title={`Cách tuyến khoảng ${Math.round(closestDistance)} m`}
                        style={{
                          width: '100%',
                          border: 'none',
                          borderTop: index ? '1px solid #f1f5f9' : 'none',
                          background: 'white',
                          padding: '8px 10px',
                          display: 'grid',
                          gridTemplateColumns: '24px minmax(0, 1fr) auto',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(event) => { event.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={(event) => { event.currentTarget.style.background = 'white' }}
                      >
                        <span style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: camera.VideoStreaming ? '#dcfce7' : '#fce7f3',
                          color: camera.VideoStreaming ? '#059669' : '#db2777',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                          </svg>
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155', fontSize: 12, fontWeight: 700 }}>
                            {camera.CamName}
                          </span>
                          <span style={{ display: 'block', color: '#94a3b8', fontSize: 10, marginTop: 1 }}>
                            {camera.District || 'TP.HCM'} · cách tuyến {Math.round(closestDistance)} m
                          </span>
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <span style={{ display: 'block', color: '#2563eb', fontSize: 11, fontWeight: 800 }}>
                            {formatDistance(distanceFromStart)}
                          </span>
                          {camera.VideoStreaming && (
                            <span style={{ display: 'block', color: '#059669', fontSize: 9, fontWeight: 800, marginTop: 2 }}>LIVE</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: '#64748b' }}>
              <span><span style={{ color: '#10b981' }}>●</span> Đang phát trực tiếp</span>
              <span><span style={{ color: '#ec4899' }}>●</span> Ảnh tĩnh</span>
            </div>
          </div>
        )}
      </div>

      {/* Custom Popup Styles */}
      <style>{`
        .leaflet-popup-content-wrapper {
          padding: 0 !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15) !important;
          overflow: hidden;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-tip {
          background: white !important;
        }
        .leaflet-popup-close-button {
          top: 10px !important;
          right: 10px !important;
          width: 30px !important;
          height: 30px !important;
          font-size: 20px !important;
          color: #64748b !important;
          background: white !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .leaflet-popup-close-button:hover {
          color: #ec4899 !important;
        }
        .user-location-marker {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(37, 99, 235, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .user-location-marker > div {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #2563eb;
          border: 2px solid white;
          box-shadow: 0 1px 5px rgba(30, 64, 175, 0.7);
        }

        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #ec4899;
        }
      `}</style>
    </div>
  )
}
