// ============================================
// Reports Management Routes
// View logs and manually trigger daily reports
// ============================================

const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Middleware to check API key
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get report logs
router.get('/logs', authenticate, (req, res) => {
  try {
    const logPath = '/var/log/tcom-report.log';
    const lines = parseInt(req.query.lines) || 100; // Default 100 lines
    
    if (!fs.existsSync(logPath)) {
      return res.json({ 
        success: true, 
        logs: 'No logs found. The log file does not exist yet.',
        file: logPath
      });
    }
    
    // Get last N lines using tail command
    const logs = execSync(`tail -n ${lines} ${logPath}`, { encoding: 'utf8' });
    
    res.json({ 
      success: true, 
      logs: logs.trim(),
      lines: lines,
      file: logPath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error reading logs:', error);
    res.status(500).json({ 
      error: 'Failed to read logs', 
      message: error.message 
    });
  }
});

// Clear report logs
router.post('/logs/clear', authenticate, (req, res) => {
  try {
    const logPath = '/var/log/tcom-report.log';
    
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '');
      res.json({ 
        success: true, 
        message: 'Logs cleared successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Log file does not exist',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ 
      error: 'Failed to clear logs', 
      message: error.message 
    });
  }
});

// Trigger report manually
router.post('/trigger', authenticate, (req, res) => {
  try {
    const { mode, skipSms } = req.body;
    
    // Validate mode
    if (!mode || !['morning', 'evening'].includes(mode)) {
      return res.status(400).json({ 
        error: 'Invalid mode. Must be "morning" or "evening"' 
      });
    }
    
    const scriptPath = '/opt/tcom-api/generate-report.js';
    
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ 
        error: 'Report script not found',
        path: scriptPath
      });
    }
    
    // Build command
    let command = `cd /opt/tcom-api && /usr/bin/node generate-report.js --mode ${mode}`;
    if (skipSms) {
      command += ' --no-sms';
    }
    command += ' >> /var/log/tcom-report.log 2>&1';
    
    // Execute report generation in background
    const { spawn } = require('child_process');
    const child = spawn('bash', ['-c', command], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    
    res.json({ 
      success: true, 
      message: `${mode.charAt(0).toUpperCase() + mode.slice(1)} report triggered successfully`,
      mode,
      skipSms: skipSms || false,
      timestamp: new Date().toISOString(),
      note: 'Report is being generated in the background. Check logs for status.'
    });
  } catch (error) {
    console.error('Error triggering report:', error);
    res.status(500).json({ 
      error: 'Failed to trigger report', 
      message: error.message 
    });
  }
});

// Get cron status
router.get('/cron/status', authenticate, (req, res) => {
  try {
    // Check if cron jobs are configured
    const cronList = execSync('crontab -l 2>/dev/null || echo "No crontab"', { encoding: 'utf8' });
    
    // Parse cron jobs related to reports
    const reportCrons = cronList
      .split('\n')
      .filter(line => line.includes('run-report.sh') || line.includes('generate-report'))
      .map(line => line.trim());
    
    res.json({
      success: true,
      active: reportCrons.length > 0,
      jobs: reportCrons,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking cron status:', error);
    res.status(500).json({ 
      error: 'Failed to check cron status', 
      message: error.message 
    });
  }
});

// Test report (no email/SMS, just return data)
router.post('/test', authenticate, async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!mode || !['morning', 'evening'].includes(mode)) {
      return res.status(400).json({ 
        error: 'Invalid mode. Must be "morning" or "evening"' 
      });
    }
    
    const scriptPath = '/opt/tcom-api/generate-report.js';
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ 
        error: 'Report script not found',
        path: scriptPath
      });
    }
    
    // Run report in test mode (capture output)
    const command = `cd /opt/tcom-api && /usr/bin/node generate-report.js --mode ${mode} --no-sms --no-email 2>&1`;
    const output = execSync(command, { 
      encoding: 'utf8',
      timeout: 30000 // 30 second timeout
    });
    
    res.json({
      success: true,
      mode,
      output: output.trim(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error testing report:', error);
    res.status(500).json({ 
      error: 'Failed to test report', 
      message: error.message,
      output: error.stdout ? error.stdout.toString() : null
    });
  }
});

module.exports = router;
