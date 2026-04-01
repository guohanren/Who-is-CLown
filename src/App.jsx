import { useState } from 'react'
import Game from './Game'
import MultiplayerGame from './MultiplayerGame'

export default function App() {
  const [mode, setMode] = useState('single') // 'single' | 'multi'

  if (mode === 'multi') {
    return <MultiplayerGame onBack={() => setMode('single')} />
  }
  return <Game onMultiplayer={() => setMode('multi')} />
}
