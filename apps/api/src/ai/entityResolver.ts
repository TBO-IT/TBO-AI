import { DatasetMetadata } from "../services/metadataService.js";
import { QuestionFilter } from "./questionTypes.js";

export function resolveEntities(
    question: string,
    metadata: DatasetMetadata
): QuestionFilter[] {
    const filters: QuestionFilter[] = [];

    const normalizedQuestion = question.toLowerCase();

    for (const destination of metadata.destinations) {
        if (
            normalizedQuestion.includes(
                destination.toLowerCase()
            )
        ) {
            filters.push(
                {
                    dimension: "destination",
                    operator: "=",
                    value: destination
                }
            );
        }

        for (const supplier of metadata.suppliers) {
            if (normalizedQuestion.includes(supplier.toLowerCase())) {
                filters.push(
                    {
                        dimension: "suppliername",
                        operator: "=",
                        value: supplier
                    }
                );
            }
        }

        for (const chain of metadata.chains) {
            if (normalizedQuestion.includes(chain.toLowerCase())) {
                filters.push(
                    {
                        dimension: "tbo_chainname",
                        operator: "=",
                        value: chain
                    }
                );
            }
        }

        for (const hotel of metadata.hotels) {
            if (normalizedQuestion.includes(hotel.toLowerCase())) {
                filters.push(
                    {
                        dimension: "tbo_hotelname",
                        operator: "=",
                        value: hotel
                    }
                );
            }
        }

        for (const country of metadata.countries) {
            if (normalizedQuestion.includes(country.toLowerCase())) {
                filters.push(
                    {
                        dimension: "country",
                        operator: "=",
                        value: country
                    }
                );
            }
        }

        for (const apwBucket of metadata.apwBuckets) {
            if (normalizedQuestion.includes(apwBucket.toLowerCase())) {
                filters.push(
                    {
                        dimension: "apw_bucket_new",
                        operator: "=",
                        value: apwBucket
                    }
                );
            }
        }
    }

    return filters;
}