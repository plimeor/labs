import { type CSSVariablesResolver, createTheme, MantineProvider } from '@mantine/core'
import { RouterProvider } from 'react-router'

import { ThemeProvider } from '@/shared/theme/ThemeProvider'

import router from './routes'

const theme = createTheme({
  primaryColor: 'violet',
  fontFamily: 'inherit',
  defaultRadius: 'md',
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5rem'
  },
  colors: {
    dark: [
      '#e8e8ec', // 0 - body text in dark mode
      '#d4d4dc', // 1
      '#9b9ba6', // 2 - dimmed text
      '#6b6b76', // 3 - tertiary text
      '#2e2e34', // 4 - borders
      '#2a2a30', // 5 - subtle borders
      '#252529', // 6 - elevated surface (component bg)
      '#19191d', // 7 - body bg
      '#131315', // 8 - deeper bg
      '#0f0f11' // 9 - darkest
    ]
  }
})

const cssResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#fafaf9',
    '--mantine-color-text': '#1a1a1e',
    '--mantine-color-dimmed': '#6b6b76'
  },
  dark: {
    '--mantine-color-body': '#19191d',
    '--mantine-color-text': '#e8e8ec',
    '--mantine-color-dimmed': '#9b9ba6'
  }
})

export function App() {
  return (
    <ThemeProvider>
      <MantineProvider theme={theme} defaultColorScheme="dark" cssVariablesResolver={cssResolver}>
        <RouterProvider router={router} />
      </MantineProvider>
    </ThemeProvider>
  )
}
