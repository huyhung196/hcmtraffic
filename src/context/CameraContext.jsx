import { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react'

const CameraContext = createContext(null)

const initialState = {
  cameras: [],
  filteredCameras: [],
  bookmarks: new Set(JSON.parse(localStorage.getItem('bookmarks') || '[]')),
  activeCamera: null,
  isLoading: true,
  error: null,
  filters: {
    search: '',
    district: '',
    camType: '',
    liveOnly: false,
    bookmarkedOnly: false,
  },
  sidebarOpen: true,
}

function cameraReducer(state, action) {
  switch (action.type) {
    case 'SET_CAMERAS':
      return {
        ...state,
        cameras: action.payload,
        filteredCameras: action.payload,
        isLoading: false,
      }

    case 'SET_FILTERED':
      return { ...state, filteredCameras: action.payload }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }

    case 'SET_ACTIVE':
      return { ...state, activeCamera: action.payload }

    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, [action.key]: action.value },
      }

    case 'TOGGLE_BOOKMARK': {
      const newBookmarks = new Set(state.bookmarks)
      if (newBookmarks.has(action.payload)) {
        newBookmarks.delete(action.payload)
      } else {
        newBookmarks.add(action.payload)
      }
      return { ...state, bookmarks: newBookmarks }
    }

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen }

    case 'SET_SIDEBAR':
      return { ...state, sidebarOpen: action.payload }

    default:
      return state
  }
}

export function CameraProvider({ children }) {
  const [state, dispatch] = useReducer(cameraReducer, initialState)

  // Load cameras on mount
  useEffect(() => {
    fetch('/cameras.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load')
        return res.json()
      })
      .then((data) => {
        const validCameras = data.filter((c) => c.Lat && c.Lng)
        dispatch({ type: 'SET_CAMERAS', payload: validCameras })
      })
      .catch((err) => {
        dispatch({ type: 'SET_ERROR', payload: err.message })
      })
  }, [])

  // Save bookmarks to localStorage
  useEffect(() => {
    localStorage.setItem('bookmarks', JSON.stringify([...state.bookmarks]))
  }, [state.bookmarks])

  // Apply filters
  useEffect(() => {
    const { search, district, camType, liveOnly, bookmarkedOnly } = state.filters
    const searchLower = search.toLowerCase()

    const filtered = state.cameras.filter((cam) => {
      if (search) {
        const matchSearch =
          cam.CamName?.toLowerCase().includes(searchLower) ||
          cam.Code?.toLowerCase().includes(searchLower) ||
          cam.District?.toLowerCase().includes(searchLower)
        if (!matchSearch) return false
      }
      if (district && cam.District !== district) return false
      if (camType && cam.CamType !== camType) return false
      if (liveOnly && !cam.VideoStreaming) return false
      if (bookmarkedOnly && !state.bookmarks.has(cam.CamId)) return false
      return true
    })

    dispatch({ type: 'SET_FILTERED', payload: filtered })
  }, [state.filters, state.cameras, state.bookmarks])

  // Actions
  const setFilter = useCallback((key, value) => {
    dispatch({ type: 'SET_FILTER', key, value })
  }, [])

  const setActiveCamera = useCallback((camId) => {
    dispatch({ type: 'SET_ACTIVE', payload: camId })
  }, [])

  const toggleBookmark = useCallback((camId) => {
    dispatch({ type: 'TOGGLE_BOOKMARK', payload: camId })
  }, [])

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' })
  }, [])

  const loadCamerasFromFile = useCallback((data) => {
    const validCameras = data.filter((c) => c.Lat && c.Lng)
    dispatch({ type: 'SET_CAMERAS', payload: validCameras })
  }, [])

  // Computed values
  const stats = useMemo(() => {
    const districts = new Set(state.cameras.map((c) => c.District).filter(Boolean))
    const camTypes = new Set(state.cameras.map((c) => c.CamType).filter(Boolean))

    return {
      total: state.cameras.length,
      live: state.cameras.filter((c) => c.VideoStreaming).length,
      districts: [...districts].sort(),
      camTypes: [...camTypes].sort(),
      bookmarkCount: state.bookmarks.size,
    }
  }, [state.cameras, state.bookmarks])

  const getCamera = useCallback(
    (camId) => state.cameras.find((c) => c.CamId === camId),
    [state.cameras]
  )

  const isBookmarked = useCallback(
    (camId) => state.bookmarks.has(camId),
    [state.bookmarks]
  )

  const getBookmarkedCameras = useCallback(
    () => state.cameras.filter((c) => state.bookmarks.has(c.CamId)),
    [state.cameras, state.bookmarks]
  )

  const value = useMemo(
    () => ({
      ...state,
      stats,
      setFilter,
      setActiveCamera,
      toggleBookmark,
      toggleSidebar,
      loadCamerasFromFile,
      getCamera,
      isBookmarked,
      getBookmarkedCameras,
    }),
    [state, stats, setFilter, setActiveCamera, toggleBookmark, toggleSidebar, loadCamerasFromFile, getCamera, isBookmarked, getBookmarkedCameras]
  )

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>
}

export function useCamera() {
  const context = useContext(CameraContext)
  if (!context) {
    throw new Error('useCamera must be used within CameraProvider')
  }
  return context
}
