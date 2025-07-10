# Elastic Beanstalk Deployment Package Instructions

## Files to Include in ZIP:

### ✅ INCLUDE these files/folders:
1. package.json
2. server/ (entire folder)
3. dist/ (entire folder) 
4. .ebextensions/ (entire folder)
5. Procfile (if created)

### ❌ DO NOT INCLUDE:
- node_modules/
- client/ (source files - already built into dist/)
- .git/
- *.log files
- .env files

## Create ZIP Package:

1. Create a new folder called 'eb-package'
2. Copy the required files/folders into 'eb-package'
3. Select ALL contents inside 'eb-package' (not the folder itself)
4. Right-click → Send to → Compressed folder
5. Name it 'cosmic-collision-v2.zip'

## Fixed Configuration:
- Updated .ebextensions with correct namespaces
- Configured for Node.js 18+ on Amazon Linux 2
- Proper environment variables setup
- Static file serving configured

## After Upload:
1. Platform: Node.js
2. Platform branch: Node.js 18 running on 64bit Amazon Linux 2  
3. Environment variables to set in EB console:
   - NODE_ENV = production
   - (ENDPOINT will be auto-configured after deployment)
