<div align="center">

  <h1>bulac-scraper</h1>

  <p>
    Digital Bulac Library Scraper
  </p>

</div>

<br />

<!-- Table of Contents -->

## :notebook_with_decorative_cover: Table of Contents

- [About the Project](#star2-about-the-project)
  - [Environment Variables](#key-environment-variables)
- [Getting Started](#toolbox-getting-started)
  - [Prerequisites](#bangbang-prerequisites)
  - [Run Locally](#running-run-locally)
- [Usage](#eyes-usage)
- [Contributing](#wave-contributing)
  - [Code of Conduct](#scroll-code-of-conduct)
- [License](#warning-license)
- [Contact](#handshake-contact)

<!-- About the Project -->

## :star2: About the Project

<!-- Env Variables -->

### :key: Environment Variables

To run this project, you will need to add the following environment variables to
your `.env` file:

- **App configs:**
  - `LOG_LEVEL`: Log level.
  - `LOG_FILE_PATH`: (Optional) File path to save logs. Default to `scraper.log`.

E.g:

```
# .env
LOG_LEVEL=info
```

You can also check out the file `.env.example` to see all required environment
variables.

<!-- Getting Started -->

## :toolbox: Getting Started

<!-- Prerequisites -->

### :bangbang: Prerequisites

- This project uses [pnpm](https://pnpm.io/) as package manager:

  ```bash
  npm install --global pnpm
  ```

  <!-- Run Locally -->

### :running: Run Locally

Clone the project:

```bash
git clone https://github.com/v-bible/bulac-scraper.git
```

Go to the project directory:

```bash
cd bulac-scraper
```

Install dependencies:

```bash
pnpm install
```

Build the project:

```bash
pnpm build
```

<!-- Usage -->

## :eyes: Usage

> [!NOTE]
> Support both "ark:" links (recommended) and manifest ("iiif") links. To get
> the manifest url of a document, you can go to the document page on Bulac,
> click on the "IIIF" button below the document viewer.

```bash
USAGE
  bulac-scraper [--outDir value] [--toPdf] [--ignoreCompleted] [--overwrite] [--fromFile value] <args>...
  bulac-scraper --help
  bulac-scraper --version

Digital Bulac Library Scraper

FLAGS
     [--outDir]                               Output directory. Default to "./output/<document-name>"
     [--toPdf/--noToPdf]                      Convert downloaded images to a single PDF file
     [--ignoreCompleted/--noIgnoreCompleted]  Skip downloading if all images already exist in the output directory, or PDF already exists if --toPdf is set
     [--overwrite/--noOverwrite]              Overwrite existing files if they already exist in the output directory
     [--fromFile]                             Path to a text file containing a list of document urls to scrape from Bulac (one url per line)
  -h  --help                                  Print help information and exit
  -v  --version                               Print version information and exit

ARGUMENTS
  args...  List of document urls to scrape from Bulac (e.g., "https://bina.bulac.fr/s/bina/ark:/73193/bcrk5b", "https://bina.bulac.fr/iiif/2/579892/manifest")
```

**Example**:

```bash
pnpm build && ./dist/cli.mjs --outDir ./my-output --toPdf https://bina.bulac.fr/s/bina/ark:/73193/bcrk5b https://bina.bulac.fr/iiif/2/572900/manifest

pmpn build && ./dist/cli.mjs --outDir ./my-output --toPdf --ignoreCompleted --overwrite --fromFile ./document-urls.txt
```

## Crawl URL from Bulac category

A small script is provided to crawl all document urls from a given Bulac
category page. You can run it as follows, requires
[`uv`](https://docs.astral.sh/uv/) tool to be installed:

```python
# scraper.py
# /// script
# dependencies = [
#   "beautifulsoup4",
#   "requests",
# ]
# ///

import time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup


def scrape_bina_ark_urls(start_url):
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
    )

    current_url = start_url
    ark_urls = set()
    page = 1

    while current_url:
        print(f"Scraping page {page}: {current_url}")
        response = session.get(current_url)

        if response.status_code != 200:
            print(f"Failed to fetch page {page}. Status: {response.status_code}")
            break

        soup = BeautifulSoup(response.text, "html.parser")

        # Extract links containing the ARK identifier pattern ('ark:/')
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "ark:/" in href:
                full_url = urljoin(current_url, href)
                # Strip query strings and fragment identifiers
                clean_url = full_url.split("?")[0].split("#")[0]
                ark_urls.add(clean_url)

        # Locate pagination "Next" link
        next_link = soup.find("a", attrs={"rel": "next"}) or soup.find(
            "a", class_=lambda c: c and "next" in c.split()
        )

        if next_link and next_link.get("href"):
            next_href = next_link["href"]
            current_url = urljoin(current_url, next_href)
            page += 1
            time.sleep(1)
        else:
            print("No next page link found. Pagination complete.")
            current_url = None

    return list(ark_urls)


if __name__ == "__main__":
    target_url = (
        "https://bina.bulac.fr/s/bina/item?Search=&property%5B0%5D%5Bproperty%5D=51&property%5B0%5D%5Btype%5D=eq&property%5B0%5D%5Btext%5D=https://www.idref.fr/029517486"
    )

    extracted_links = scrape_bina_ark_urls(target_url)

    print(f"\nSuccessfully collected {len(extracted_links)} ARK URLs:")
    for link in extracted_links:
        print(link)
```

```bash
uv run ./scraper.py
```

<!-- Contributing -->

## :wave: Contributing

<a href="https://github.com/v-bible/bulac-scraper/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=v-bible/bulac-scraper" alt="contributors" />
</a>

Contributions are always welcome!

Please read the [contribution guidelines](./CONTRIBUTING.md).

<!-- Code of Conduct -->

### :scroll: Code of Conduct

Please read the [Code of Conduct](./CODE_OF_CONDUCT.md).

<!-- License -->

## :warning: License

This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)** License.

[![License: CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/).

See the **[LICENSE.md](./LICENSE.md)** file for full details.

<!-- Contact -->

## :handshake: Contact

Duong Vinh - [@duckymomo20012](https://twitter.com/duckymomo20012) -
tienvinh.duong4@gmail.com

Project Link:
[https://github.com/v-bible/bulac-scraper](https://github.com/v-bible/bulac-scraper).
