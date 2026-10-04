import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleIdentityPageContractTests: XCTestCase {
    func testSharedCanonicalVectorsBindFactsAndRejectChangedPages() throws {
        let vectors = [
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":0,"previous_page_id":null,"objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"facts":{"section":"versions","after":null,"limit":64,"digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"page_id":"99e1837336dfad2dbb312437a933d7c0263cd8d091c562d988ad8ef69aa85601"},"fact_tail":{"nextAfter":null}}"#,
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":0,"previous_page_id":null,"objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"facts":{"section":"parents","after":null,"limit":64,"digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"page_id":"f4c3f05e436794b866eb74ad417d36f6c2aa5dfa6a5453a4c28025642b467b50"},"fact_tail":{"nextAfter":null}}"#,
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":0,"previous_page_id":null,"objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"facts":{"section":"reviews","after":null,"limit":64,"digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"page_id":"f191a2809ba014465e9e6484cadd0d8177eab25f214bf7cf6dd259d27a886ace"},"fact_tail":{"nextAfter":null}}"#,
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":0,"previous_page_id":null,"objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"facts":{"section":"head","after":null,"limit":64,"digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"page_id":"b28cce190feb0822f7ce8b3f656c3c3c6d1387ed7e0c17b0205321ab1313aecd"}}"#,
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":0,"previous_page_id":null,"objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"restore_id":"restore","restore_set_id":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","page_id":"0feb0075bd6f0f1d164f7743cebe36516de3410f699954b021423c792878b456"}}"#,
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":1,"previous_page_id":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"facts":{"section":"parents","after":"[\"v😀\",2,\"p/中\"]","limit":1,"digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"page_id":"fdfa0fad47aa72be00ac047701bcb9d662c527dfb794380b712379beeaa2c43b"},"fact_tail":{"nextAfter":"[\"v😀\",3,\"p/中\"]"}}"#,
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":0,"previous_page_id":null,"objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"facts":{"section":"versions","after":null,"limit":64,"digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"page_id":"99e1837336dfad2dbb312437a933d7c0263cd8d091c562d988ad8ef69aa85601"},"fact_chunk":{"key":"v😀","offset":0,"total":600000},"fact_tail":{"nextAfter":null,"chunk":{"key":"v😀","nextOffset":262144,"total":600000}}}"#,
            #"{"page":{"contract":"global-id-v1","group_id":"g</中文😀 \n","source_peer_id":"source","target_peer_id":"target","source_view_id":"00000000-0000-4000-8000-000000000000","page_index":0,"previous_page_id":null,"objects":[{"object_type":"node","object_id":"child","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"facts":{"section":"versions","after":null,"limit":64,"digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","chunk":{"key":"v😀","offset":262144,"total":600000}},"page_id":"2e3f16b984b75dad5a8558b2d16c2fc7af3ff398498604e1f2f5e4244b90620e"},"fact_chunk":{"key":"v😀","offset":262144,"total":600000},"fact_tail":{"nextAfter":null,"chunk":{"key":"v😀","nextOffset":524288,"total":600000}}}"#,
        ]
        for vector in vectors {
            let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(vector.utf8)) as? [String: Any])
            let page = try XCTUnwrap(manifest["page"] as? [String: Any])
            XCTAssertNoThrow(try FolioleCompanionIdentityPageContract.validate(page, manifest: manifest))
            var changed = page
            changed["group_id"] = "tampered"
            XCTAssertThrowsError(try FolioleCompanionIdentityPageContract.validate(changed, manifest: manifest))
            if let facts = page["facts"] as? [String: Any], facts["section"] as? String != "head" {
                var missing = manifest
                missing.removeValue(forKey: "fact_tail")
                XCTAssertThrowsError(try FolioleCompanionIdentityPageContract.validate(page, manifest: missing))
            } else {
                var unexpected = manifest
                unexpected["fact_tail"] = ["nextAfter": NSNull()]
                XCTAssertThrowsError(try FolioleCompanionIdentityPageContract.validate(page, manifest: unexpected))
            }
        }
    }
}
