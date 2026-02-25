# Contentful Migration

A Node.js application to migrate content from JSON files to Contentful CMS using a mapping-driven architecture.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Adding New Content Types](#adding-new-content-types)

## Features

- JSON-driven content migration to Contentful CMS
- Mapping-based content type configuration
- Generic component handler for flexible field mapping
- Rich text conversion from HTML
- Content type validation before linking
- Dry run mode for testing
- Update existing entries or create new ones
- Environment variable configuration

## Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- Contentful account with API access

## Installation

1. Clone the repository:
```bash
git clone https://github.com/krzwt/contentful-migration.git
cd contentful-migration
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Contentful credentials:
```env
CONTENTFUL_SPACE_ID=your_space_id
CONTENTFUL_ENVIRONMENT_ID=your_environment_id
CONTENTFUL_MANAGEMENT_TOKEN=your_management_token
```

## Configuration

### Environment Setup
- `config/contentful.js` - Contentful API configuration and environment setup

### Component Registry
- `registry.js` - Maps data source fields to content type handlers and mappings

### Field Mappings
JSON mapping files in `mappings/` define how source data maps to Contentful fields:

```json
{
  "contentType": "homeHero",
  "idField": "id",
  "fields": {
    "blockId": { "from": "id", "type": "text" },
    "heroTitle": { "from": "headingSection", "type": "text" },
    "heroDescription": { "from": "descSection", "type": "richText" }
  }
}
```

## Usage

### Run Migration
```bash
npm run migrate
```

### Dry Run Mode
Edit `index.js` and set `DRY_RUN = true` to test without making changes.

### Data Source
Update `JSON_FILE` constant in `index.js` to point to your data file.

## Project Structure

```
contentful-migration/
├── config/
│   └── contentful.js              # Contentful API configuration
├── data/
│   ├── standalone-test.json       # Test data file
│   └── *.json                     # Other data sources
├── handlers/
│   ├── genericComponent.js        # Generic mapping-driven handler
│   └── homeHero.js                # Custom handler example
├── mappings/
│   ├── homeHero.json              # homeHero content type mapping
│   └── contentBlock.json       # contentBlock mapping
├── utils/
│   ├── assets.js                  # Asset upload utilities
│   ├── normalize.js               # Data normalization
│   └── richText.js                # HTML to rich text conversion
├── bkp/                           # Backup files
├── .env                           # Environment variables (not tracked)
├── .gitignore                     # Git ignore rules
├── package.json                   # Project dependencies and scripts
├── index.js                       # Main migration script
├── registry.js                    # Component registry
└── README.md                      # This file
```

## Adding New Content Types

1. Create a mapping file in `mappings/yourContentType.json`
2. Register it in `registry.js`:
```javascript
import yourContentType from "./mappings/yourContentType.json" with { type: "json" };

export const COMPONENTS = {
  yourFieldName: {
    handler: genericComponentHandler,
    mapping: yourContentType
  }
};
```
3. Add corresponding data to your JSON source file

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
