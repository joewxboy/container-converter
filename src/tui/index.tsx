#!/usr/bin/env node
/**
 * Container Converter TUI Entry Point
 * Interactive terminal UI for converting Dockerfiles to SDFs
 */

import React from 'react';
import { render } from 'ink';
import App from './App.js';

// Render the TUI application
render(<App />);
