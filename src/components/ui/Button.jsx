import { forwardRef } from 'react'
import clsx from 'clsx'
import styles from './Button.module.css'

const Button = forwardRef(function Button(
  {
    children,
    variant = 'default',
    size = 'md',
    icon,
    iconPosition = 'left',
    className,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={clsx(
        styles.button,
        styles[variant],
        styles[size],
        icon && !children && styles.iconOnly,
        className
      )}
      {...props}
    >
      {icon && iconPosition === 'left' && <span className={styles.icon}>{icon}</span>}
      {children && <span>{children}</span>}
      {icon && iconPosition === 'right' && <span className={styles.icon}>{icon}</span>}
    </button>
  )
})

export default Button
