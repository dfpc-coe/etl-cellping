<h1 align='center'>ETL-CellPing</h1>

<p align='center'>Cell phone location pings received by email for CloudTAK</p>

Carriers answer an exigent location request with an email describing where a phone was located.
This ETL is given an email address by CloudTAK, parses the emails sent or forwarded to it and submits
each location to TAK as Cursor-on-Target.

## Architecture

The task is only invoked by email - it lists `InvocationType.Email` and has no schedule. CloudTAK
delivers each email addressed to the Layer to the `email()` method of the task, which

1. Collapses the text of the email - or its HTML if it has no text - to single spaced text with reply quoting removed
2. Tests the text against each parser in [`lib/parsers/`](lib/parsers/) and parses it with the first that recognises it
3. Submits a point for each location along with a circle of its uncertainty

An email that no parser recognises is logged and nothing is submitted.

### Parsers

| Parser | Carrier | Format |
| ------ | ------- | ------ |
| `tmobile` | T-Mobile | `Location of <phone> at <M/D/YYYY h:mm:ss AM> <time zone> === Result === Lat, Long: <lat>,<lon> Uncertainty: <meters>m <url>` |

The location is taken from the `Lat, Long` of the email, the URL is kept as it was written by the carrier.

Times are converted to UTC from the time zone that the carrier names, which can be a US zone such as
`Pacific Daylight Time`, its abbreviation or a `UTC-07:00` style offset. If the zone isn't known the
location is submitted with the time that the email was sent and the original value is retained as `located`.

A parser is added by implementing `PingParser` in `lib/parsers/`, adding it to `PARSERS` in
[`lib/parsers/index.ts`](lib/parsers/index.ts) and adding a sample of its format to `test/parsers.test.ts`.

### Feature Mapping

| Feature | ID | CoT Type | Callsign |
| ------- | -- | -------- | -------- |
| Location | `cellping-<phone>-<epoch seconds>` | `a-u-G` | `<phone> <HH:mm>Z` |
| Uncertainty | `cellping-<phone>-<epoch seconds>-uncertainty` | `u-d-c-c` | `<phone> <HH:mm>Z Uncertainty` |

Each location of a phone is its own feature so that successive pings remain on the map, while an email
that is delivered or forwarded more than once updates the features that it already created. A Layer
that writes to a Data Sync should not enable Mission Diff, as each email would remove the locations
of the emails before it.

### Environment

| Name | Default | Description |
| ---- | ------- | ----------- |
| `Uncertainty` | `true` | Draw the uncertainty of a location as a circle around it |
| `DEBUG` | `false` | Print parsed locations in logs - they contain phone numbers |

### Senders

The senders that a Layer accepts email from are configured on the Layer in CloudTAK. They are
enforced against the `From` header, so they have to include the people that forward carrier emails
to the Layer as well as the carriers themselves.

## Development

DFPC provided Lambda ETLs are currently all written in [NodeJS](https://nodejs.org/en) through the use of a AWS Lambda optimized
Docker container. Documentation for the Dockerfile can be found in the [AWS Help Center](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)

```sh
npm install
```

Add a .env file in the root directory that gives the ETL script the necessary variables to communicate with a local ETL server.
When the ETL is deployed the `ETL_API` and `ETL_LAYER` variables will be provided by the Lambda Environment

```json
{
    "ETL_API": "http://localhost:5001",
    "ETL_LAYER": "19"
}
```

To deliver an email to the task, ensure the local [CloudTAK](https://github.com/dfpc-coe/CloudTAK/) server is running and then
give it the path of a `.eml` file

```
npm run build
cp .env dist/
node dist/task.js control:email test/fixtures/tmobile.eml
```

### Tests

```sh
npm test
```

### Deployment

Deployment into the CloudTAK environment for configuration is done via automatic releases to the DFPC AWS environment.

Github actions will build and push docker releases on every version tag which can then be automatically configured via the
CloudTAK API.

Builds are performed by the `cloudtak-etl` script provided by [`@tak-ps/etl`](https://github.com/dfpc-coe/etl-base).
It requires a `capabilities.json` document alongside the `Dockerfile` which describes the task (name, description,
compute requirements, permissions & invocation types) and is validated and embedded in the OCI Image Manifest as a
`com.cloudtak.capabilities` annotation so CloudTAK can read it directly from ECR before the task is ever deployed.
Update `capabilities.json` whenever the task's requirements change.

To build & push manually:

```sh
export AWS_REGION='us-east-1'
export AWS_ACCOUNT_ID='123456789012'
export Environment='prod' # Optional - defaults to prod

npx cloudtak-etl
```

Non-DFPC users will need to setup their own docker => ECS build system via something like Github Actions or AWS Codebuild.
