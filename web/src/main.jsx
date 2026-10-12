import { render } from 'preact';
import { App } from './App';
import './styles/global.css';

render(<App />, /** @type {HTMLElement} */ (document.getElementById('root')));
