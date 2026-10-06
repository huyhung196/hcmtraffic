import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { useCamera } from '../../context/CameraContext'
import { useDebounce } from '../../hooks/useDebounce'
import { Icon, Button } from '../ui'
import CameraList from '../camera/CameraList'
import styles from './Sidebar.module.css'

export default function Sidebar({ onCameraSelect }) {
  const {
    stats,
    filters,
    setFilter,
    sidebarOpen,
    toggleSidebar,
    filteredCameras,
  } = useCamera()

  const [searchValue, setSearchValue] = useState('')
  const debouncedSearch = useDebounce(searchValue, 300)

  // Sync debounced search with filter
  useMemo(() => {
    if (debouncedSearch !== filters.search) {
      setFilter('search', debouncedSearch)
    }
  }, [debouncedSearch, filters.search, setFilter])

  return (
    <aside className={clsx(styles.sidebar, !sidebarOpen && styles.collapsed)}>
      <button
        className={styles.toggle}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <Icon name={sidebarOpen ? 'chevronLeft' : 'chevronRight'} size={20} />
      </button>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <Icon name="camera" size={28} fill="white" strokeWidth={0} />
          </div>
          <div className={styles.brandText}>
            <h1>HCMC Traffic</h1>
            <p>Command Center</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{stats.total}</span>
            <span className={styles.kpiLabel}>Total</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={clsx(styles.kpiValue, styles.live)}>{stats.live}</span>
            <span className={styles.kpiLabel}>Live</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={clsx(styles.kpiValue, styles.districts)}>
              {stats.districts.length}
            </span>
            <span className={styles.kpiLabel}>Districts</span>
          </div>
        </div>
      </header>

      {/* Search & Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <Icon name="search" size={18} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search cameras, roads..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>

        <div className={styles.filterRow}>
          <button
            className={clsx(styles.filterPill, filters.liveOnly && styles.active)}
            onClick={() => setFilter('liveOnly', !filters.liveOnly)}
          >
            Live Only
          </button>
          <button
            className={clsx(
              styles.filterPill,
              styles.bookmark,
              filters.bookmarkedOnly && styles.active
            )}
            onClick={() => setFilter('bookmarkedOnly', !filters.bookmarkedOnly)}
          >
            Bookmarked ({stats.bookmarkCount})
          </button>
        </div>

        <div className={styles.filterSelects}>
          <select
            className={styles.select}
            value={filters.district}
            onChange={(e) => setFilter('district', e.target.value)}
          >
            <option value="">All Districts</option>
            {stats.districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            className={styles.select}
            value={filters.camType}
            onChange={(e) => setFilter('camType', e.target.value)}
          >
            <option value="">All Types</option>
            {stats.camTypes.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Camera List */}
      <div className={styles.listSection}>
        <div className={styles.listHeader}>
          <span className={styles.listCount}>
            Showing <strong>{filteredCameras.length}</strong> cameras
          </span>
        </div>
        <CameraList cameras={filteredCameras} onSelect={onCameraSelect} />
      </div>
    </aside>
  )
}
