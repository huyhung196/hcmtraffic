import Icon from './Icon'
import styles from './LoadingScreen.module.css'

export default function LoadingScreen({ isLoading }) {
  if (!isLoading) return null

  return (
    <div className={styles.screen}>
      <div className={styles.logo}>
        <Icon name="camera" size={48} fill="white" strokeWidth={0} />
      </div>
      <p className={styles.text}>Initializing Traffic Command Center...</p>
      <div className={styles.bar}>
        <div className={styles.fill} />
      </div>
    </div>
  )
}
