import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Setup route to create the bin_locations metafield definition
 * This ensures the metafield exists in the store before trying to use it
 */
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Check if metafield definition already exists
    const checkResponse = await admin.graphql(
      `#graphql
      query checkMetafieldDefinition {
        metafieldDefinitions(first: 50, ownerType: PRODUCT) {
          edges {
            node {
              id
              name
              namespace
              key
              type {
                name
              }
            }
          }
        }
      }`
    );

    const checkData = await checkResponse.json();
    const definitions = checkData.data?.metafieldDefinitions?.edges || [];
    const binLocationExists = definitions.some(
      (edge) =>
        edge.node.namespace === "custom" && edge.node.key === "bin_locations"
    );

    if (binLocationExists) {
      return json({
        success: true,
        message: "Bin Locations metafield already exists",
        alreadyExists: true,
      });
    }

    // Create the metafield definition
    const createResponse = await admin.graphql(
      `#graphql
      mutation createMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
            type {
              name
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          definition: {
            name: "Bin Locations",
            namespace: "custom",
            key: "bin_locations",
            type: "single_line_text_field",
            ownerType: "PRODUCT",
            description: "Physical bin location for warehouse inventory management",
          },
        },
      }
    );

    const createData = await createResponse.json();
    const userErrors =
      createData.data?.metafieldDefinitionCreate?.userErrors || [];

    if (userErrors.length > 0) {
      console.error("[METAFIELD SETUP] Errors:", userErrors);

      // Check if error is because metafield already exists
      const alreadyExistsError = userErrors.find(err =>
        err.message && err.message.toLowerCase().includes("in use")
      );

      if (alreadyExistsError) {
        return json({
          success: true,
          message: "Bin Locations metafield already exists in your store",
          alreadyExists: true,
        });
      }

      return json({
        success: false,
        error: userErrors[0].message,
        userErrors,
      });
    }

    const createdDef =
      createData.data?.metafieldDefinitionCreate?.createdDefinition;

    return json({
      success: true,
      message: "Bin Locations metafield definition created successfully",
      definition: createdDef,
    });
  } catch (error) {
    console.error("[METAFIELD SETUP] Error:", error);
    return json({
      success: false,
      error: error.message,
    });
  }
};
