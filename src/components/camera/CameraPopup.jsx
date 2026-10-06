import { useState, useEffect, useCallback } from 'react'
import { useCamera } from '../../context/CameraContext'
import { useInterval } from '../../hooks/useInterval'
import { useToast } from '../ui/Toast'
import { Icon } from '../ui'
import { addTimestampToUrl, copyToClipboard, getCameraImageUrl } from '../../utils/helpers'
import styles from './CameraPopup.module.css'

const REFRESH_INTERVAL = 10000

export default function CameraPopup({ camera, onFullscreen }) {
  const { isBookmarked, toggleBookmark } = useCamera()
  const { addToast } = useToast()
  const [imgSrc, setImgSrc] = useState(getCameraImageUrl(camera.SnapshotUrl))
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)

  const bookmarked = isBookmarked(camera.CamId)

  // Auto refresh countdown
  useInterval(() => {
    setProgress((p) => {
      if (p >= 100) {
        refreshImage()
        return 0
      }
      return p + (100 / (REFRESH_INTERVAL / 1000))
    })
  }, 1000)

  const refreshImage = useCallback(() => {
    setLoading(true)
    setImgSrc(addTimestampToUrl(getCameraImageUrl(camera.SnapshotUrl)))
    setProgress(0)
  }, [camera.SnapshotUrl])

  const handleCopy = useCallback(() => {
    copyToClipboard(`${camera.Lat}, ${camera.Lng}`)
    addToast('Coordinates copied!', 'success')
  }, [camera.Lat, camera.Lng, addToast])

  const handleBookmark = useCallback(() => {
    toggleBookmark(camera.CamId)
    addToast(
      bookmarked ? 'Removed from bookmarks' : 'Added to bookmarks',
      bookmarked ? 'info' : 'success'
    )
  }, [camera.CamId, toggleBookmark, bookmarked, addToast])

  return (
    <div className={styles.popup}>
      <div className={styles.header}>
        <h3 className={styles.title}>{camera.CamName}</h3>
        <div className={styles.tags}>
          <span className={styles.tag}>{camera.District || 'TP.HCM'}</span>
          {camera.Code && <span className={`${styles.tag} ${styles.code}`}>{camera.Code}</span>}
          {camera.VideoStreaming && <span className={`${styles.tag} ${styles.live}`}>LIVE</span>}
          {camera.CamType && <span className={styles.tag}>{camera.CamType.toUpperCase()}</span>}
        </div>
      </div>

      <div className={`${styles.imageWrapper} ${loading ? styles.loading : ''}`}>
        {loading && (
          <div className={styles.loader}>
            <div className={styles.spinner} />
            <span>Loading...</span>
          </div>
        )}
        <img
          src={imgSrc}
          alt={camera.CamName}
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.actions}>
        <button className={`${styles.btn} ${styles.primary}`} onClick={refreshImage}>
          <Icon name="refresh" size={16} />
          <span>Refresh</span>
        </button>
        <button
          className={`${styles.btn} ${bookmarked ? styles.bookmarked : ''}`}
          onClick={handleBookmark}
        >
          <Icon name="bookmark" size={16} fill={bookmarked ? 'currentColor' : 'none'} />
          <span>{bookmarked ? 'Saved' : 'Save'}</span>
        </button>
        <button className={styles.btn} onClick={() => onFullscreen(camera)}>
          <Icon name="maximize" size={16} />
          <span>Full</span>
        </button>
        <button className={styles.btn} onClick={handleCopy}>
          <Icon name="copy" size={16} />
          <span>Copy</span>
        </button>
      </div>
    </div>
  )
}
