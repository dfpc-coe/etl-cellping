import type { Static, TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { Event, EmailMessage, Feature } from '@tak-ps/etl';
import ETL, { SchemaType, handler as internal, local, DataFlowType, InvocationType } from '@tak-ps/etl';
import { parsePings, htmlToText } from './lib/parsers/index.js';
import { pingFeatures } from './lib/features.js';

const InputSchema = Type.Object({
    'Uncertainty': Type.Boolean({
        default: true,
        description: 'Draw the uncertainty of a location as a circle around it'
    }),
    'DEBUG': Type.Boolean({
        default: false,
        description: 'Print parsed locations in logs - they contain phone numbers'
    })
});

const OutputSchema = Type.Object({
    parser: Type.String({ description: 'Parser that recognised the email' }),
    carrier: Type.String(),
    phone: Type.String(),
    time: Type.String({ format: 'date-time', description: 'Time of the location' }),
    located: Type.String({ description: 'Time of the location as written by the carrier' }),
    lat: Type.Number(),
    lon: Type.Number(),
    uncertainty: Type.Optional(Type.Number({ description: 'Radius in meters' })),
    url: Type.Optional(Type.String()),
    email_id: Type.String(),
    email_from: Type.Optional(Type.String()),
    email_subject: Type.String(),
    email_date: Type.Optional(Type.String({ format: 'date-time' }))
});

export default class Task extends ETL {
    static name = 'etl-cellping'
    static flow = [ DataFlowType.Incoming ];
    static invocation = [ InvocationType.Email ];
    static invocationDefaults = { email: { enabled: true } };

    async schema(
        type: SchemaType = SchemaType.Input,
        flow: DataFlowType = DataFlowType.Incoming
    ): Promise<TSchema> {
        if (flow === DataFlowType.Incoming) {
            if (type === SchemaType.Input) {
                return InputSchema;
            } else {
                return OutputSchema;
            }
        } else {
            return Type.Object({});
        }
    }

    async email(message: EmailMessage): Promise<void> {
        const env = await this.env(InputSchema);

        let pings = parsePings(message.text || '');
        if (!pings.length && message.html) pings = parsePings(htmlToText(message.html));

        if (!pings.length) {
            console.error(`not ok - email ${message.id} does not contain a known location format`);
            return;
        }

        const sent = message.date ? new Date(message.date) : new Date(NaN);
        const dated = !isNaN(sent.getTime());

        const metadata: Record<string, unknown> = {
            email_id: message.id,
            email_subject: message.subject
        };

        if (message.from) metadata.email_from = message.from.address;
        if (dated) metadata.email_date = sent.toISOString();

        const features: Static<typeof Feature.InputFeature>[] = [];

        for (const ping of pings) {
            if (env.DEBUG) console.log(`ok - ${JSON.stringify(ping)}`);

            if (!ping.time) {
                console.error(`not ok - email ${message.id} has an unknown time zone: ${ping.located}`);
            }

            features.push(...pingFeatures(ping, {
                fallback: dated ? sent : new Date(),
                uncertainty: env.Uncertainty,
                metadata
            }));
        }

        console.log(`ok - email ${message.id} contained ${pings.length} location(s)`);

        const fc: Static<typeof Feature.InputFeatureCollection> = {
            type: 'FeatureCollection',
            features: features
        }

        await this.submit(fc);
    }
}

await local(await Task.init(import.meta.url), import.meta.url);
export async function handler(event: Event = {}) {
    return await internal(new Task(import.meta.url), event);
}
