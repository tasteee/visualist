import './zest'
import './app.css'
import './ui/tones.css'
import { mount } from 'svelte'
import App from './App.svelte'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Missing #root element')

const app = mount(App, { target: rootElement })
export default app
